#!/usr/bin/env python3
import json
import os
import re
import sys
from difflib import get_close_matches
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API_BASE_LEGACY = "https://api.aftership.com/v4"
API_BASE_ASAT = "https://api.aftership.com/tracking/2024-07"

# Friendly aliases to prevent common courier_code mistakes
COURIER_ALIASES = {
    "cainiao": "cainiao",
    "cainiao-global": "cainiao",
    "cainiaoglobal": "cainiao",
    "imile": "imile",
    "imili": "imile",
    "imilie": "imile",
    "i-mile": "imile",
    "i mile": "imile",
    "australia-post": "australia-post",
    "australian-post": "australia-post",
    "auspost": "australia-post",
    "australia post": "australia-post",
    "australian post": "australia-post",
}

ASCII_LOGO = r"""
 ____   _    ____   ____ _____ _     
|  _ \ / \  |  _ \ / ___| ____| |    
| |_) / _ \ | |_) | |   |  _| | |    
|  __/ ___ \|  _ <| |___| |___| |___ 
|_| /_/   \_\_| \_\\____|_____|_____|
      Delivery Tracker
"""


def detect_api_mode(api_key: str) -> str:
    if api_key.strip().startswith("asat_"):
        return "asat"
    return "legacy"


def get_api_base(api_key: str) -> str:
    return API_BASE_ASAT if detect_api_mode(api_key) == "asat" else API_BASE_LEGACY


def get_auth_header_name(api_key: str) -> str:
    return "as-api-key" if detect_api_mode(api_key) == "asat" else "aftership-api-key"


def api_request(path: str, api_key: str, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{get_api_base(api_key)}{path}"
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    req = Request(
        url=url,
        data=body,
        method=method,
        headers={
            get_auth_header_name(api_key): api_key,
            "content-type": "application/json",
        },
    )

    try:
        with urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(error_body)
        except json.JSONDecodeError:
            parsed = {"meta": {"message": error_body or str(exc)}}
        raise RuntimeError(parsed) from exc
    except URLError as exc:
        raise RuntimeError({"meta": {"message": f"Network error: {exc.reason}"}}) from exc


def fetch_valid_couriers(api_key: str) -> set[str]:
    result = api_request("/couriers", api_key)
    couriers = result.get("data", {}).get("couriers", [])
    return {str(courier.get("slug", "")).strip().lower() for courier in couriers if courier.get("slug")}


def canonicalize_courier_input(raw_value: str) -> str:
    lowered = raw_value.strip().lower()
    lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
    lowered = re.sub(r"-+", "-", lowered).strip("-")
    return lowered


def normalize_courier_code(raw_value: str, valid_couriers: set[str]) -> tuple[str | None, list[str]]:
    clean = raw_value.strip().lower()
    if not clean:
        return None, []

    normalized_input = canonicalize_courier_input(clean)

    if clean in COURIER_ALIASES:
        alias = COURIER_ALIASES[clean]
        if alias in valid_couriers:
            return alias, []
        if alias in {"cainiao", "imile", "australia-post"}:
            return alias, []

    if normalized_input in COURIER_ALIASES:
        alias = COURIER_ALIASES[normalized_input]
        if alias in valid_couriers:
            return alias, []
        if alias in {"cainiao", "imile", "australia-post"}:
            return alias, []

    if normalized_input in valid_couriers:
        return normalized_input, []

    if clean in valid_couriers:
        return clean, []

    suggestions = sorted(set(get_close_matches(normalized_input, list(valid_couriers), n=5, cutoff=0.55)))

    # Ensure key couriers are suggested when they are available
    for common in ("cainiao", "imile", "australia-post"):
        if common in valid_couriers and common not in suggestions:
            if common.startswith(normalized_input[:3]) or normalized_input in COURIER_ALIASES:
                suggestions.append(common)

    return None, suggestions


def create_tracking(api_key: str, courier_code: str, tracking_number: str) -> dict[str, Any]:
    if detect_api_mode(api_key) == "asat":
        payload = {
            "slug": courier_code,
            "tracking_number": tracking_number,
        }
    else:
        payload = {
            "tracking": {
                "slug": courier_code,
                "tracking_number": tracking_number,
            }
        }
    return api_request("/trackings", api_key, method="POST", payload=payload)


def fetch_tracking_by_id(api_key: str, tracking_id: str) -> dict[str, Any]:
    return api_request(f"/trackings/{tracking_id}", api_key)


def process_tracking_request(api_key: str, tracking_number: str, courier_input: str) -> dict[str, Any]:
    valid_couriers = fetch_valid_couriers(api_key)
    courier_code, suggestions = normalize_courier_code(courier_input, valid_couriers)
    if not courier_code:
        return {
            "ok": False,
            "error": "The value of courier_code is invalid.",
            "suggestions": suggestions,
        }

    try:
        result = create_tracking(api_key, courier_code, tracking_number)
    except RuntimeError as err:
        details = err.args[0] if err.args else {}
        meta = details.get("meta", {}) if isinstance(details, dict) else {}
        data = details.get("data", {}) if isinstance(details, dict) else {}
        if meta.get("code") == 4003 and data:
            detailed_tracking = data
            tracking_id = data.get("id")
            if tracking_id:
                try:
                    lookup = fetch_tracking_by_id(api_key, tracking_id)
                    lookup_data = lookup.get("data", {}) if isinstance(lookup, dict) else {}
                    detailed_tracking = lookup_data.get("tracking", lookup_data)
                except RuntimeError:
                    detailed_tracking = data

            return {
                "ok": True,
                "courier_code": detailed_tracking.get("slug", data.get("slug", courier_code)),
                "tracking_number": detailed_tracking.get("tracking_number", data.get("tracking_number", tracking_number)),
                "tag": detailed_tracking.get("tag", data.get("tag", "Existing")),
                "raw": detailed_tracking,
            }
        raise

    data = result.get("data", {})
    tracking = data.get("tracking", data)
    return {
        "ok": True,
        "courier_code": tracking.get("slug", courier_code),
        "tracking_number": tracking.get("tracking_number", tracking_number),
        "tag": tracking.get("tag", "N/A"),
        "raw": tracking,
    }


def read_api_key() -> str:
    env_key = os.getenv("AFTERSHIP_API_KEY", "").strip()
    if env_key:
        return env_key

    return input("Enter your AfterShip API key: ").strip()


def print_debug_error(error: RuntimeError) -> None:
    details = error.args[0] if error.args else {}
    meta = details.get("meta", {}) if isinstance(details, dict) else {}

    print("\nAPI request failed.")
    if meta:
        for key in ("code", "type", "message"):
            if key in meta:
                print(f"- {key}: {meta[key]}")

    if isinstance(details, dict):
        data = details.get("data")
        if data:
            print(f"- data: {json.dumps(data, indent=2)}")


def main() -> int:
    print(ASCII_LOGO)
    print("Track parcel with courier validation (Cainiao, iMile, Australia Post ready).\n")

    api_key = read_api_key()
    if not api_key:
        print("API key is required.")
        return 1

    tracking_number = input("Enter tracking number: ").strip()
    if not tracking_number:
        print("Tracking number is required.")
        return 1

    courier_input = input("Enter courier code (e.g. cainiao, imile, australia-post): ")
    try:
        outcome = process_tracking_request(api_key, tracking_number, courier_input)
    except RuntimeError as err:
        print("Could not complete tracking request.")
        print_debug_error(err)
        return 1

    if not outcome.get("ok"):
        print("\nError: The value of courier_code is invalid.")
        suggestions = outcome.get("suggestions", [])
        if suggestions:
            print("Try one of these:")
            for item in suggestions:
                print(f"- {item}")
        else:
            print("No close match found. Check available codes from /couriers endpoint.")
        return 1

    print("\nTracking created/fetched successfully.")
    print(f"- courier_code: {outcome.get('courier_code')}")
    print(f"- tracking_number: {outcome.get('tracking_number')}")
    print(f"- tag: {outcome.get('tag')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
