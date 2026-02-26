#!/usr/bin/env python3
import html
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

from tracker import process_tracking_request

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8080"))


def render_page(message: str = "", error: str = "", api_key: str = "", tracking_number: str = "", courier_code: str = "") -> str:
    escaped_message = html.escape(message)
    escaped_error = html.escape(error)
    escaped_tracking = html.escape(tracking_number)
    escaped_courier = html.escape(courier_code)
    escaped_key = html.escape(api_key)

    status_html = ""
    if escaped_error:
        status_html = f'<div class="status error">{escaped_error}</div>'
    elif escaped_message:
        status_html = f'<div class="status ok">{escaped_message}</div>'

    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>Parcel Delivery Tracker</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 0; background: #f5f7fb; }}
    .wrap {{ max-width: 760px; margin: 40px auto; background: white; padding: 24px; border-radius: 10px; box-shadow: 0 2px 14px rgba(0,0,0,.08); }}
    h1 {{ margin-top: 0; }}
    .help {{ color: #475569; margin-bottom: 18px; }}
    label {{ display: block; margin: 12px 0 6px; font-weight: 600; }}
    input {{ width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; }}
    button {{ margin-top: 16px; background: #2563eb; color: white; border: 0; padding: 10px 14px; border-radius: 8px; cursor: pointer; }}
    .status {{ margin-top: 16px; padding: 12px; border-radius: 8px; white-space: pre-wrap; }}
    .status.ok {{ background: #ecfdf3; color: #166534; border: 1px solid #86efac; }}
    .status.error {{ background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }}
    .muted {{ margin-top: 12px; color: #64748b; font-size: 14px; }}
  </style>
</head>
<body>
  <main class=\"wrap\">
    <h1>Parcel Delivery Tracker</h1>
    <div class=\"help\">Supports Cainiao, iMile (including Imilie typo), Australia Post, and other AfterShip couriers.</div>
    <form method=\"post\" action=\"/track\">
      <label>AfterShip API Key</label>
      <input type=\"password\" name=\"api_key\" value=\"{escaped_key}\" required />

      <label>Tracking Number</label>
      <input type=\"text\" name=\"tracking_number\" value=\"{escaped_tracking}\" required />

      <label>Courier Code</label>
      <input type=\"text\" name=\"courier_code\" value=\"{escaped_courier}\" placeholder=\"cainiao / imile / australia-post\" required />

      <button type=\"submit\">Track Parcel</button>
    </form>
    {status_html}
    <div class=\"muted\">Tip: Use courier aliases like imili / imilie / auspost.</div>
  </main>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path != "/":
            self.send_error(404)
            return
        self._send_html(render_page())

    def do_POST(self) -> None:
        if self.path != "/track":
            self.send_error(404)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length).decode("utf-8", errors="replace")
        form = parse_qs(body)

        api_key = form.get("api_key", [""])[0].strip()
        tracking_number = form.get("tracking_number", [""])[0].strip()
        courier_code = form.get("courier_code", [""])[0].strip()

        if not api_key or not tracking_number or not courier_code:
            self._send_html(
                render_page(
                    error="Please fill in API key, tracking number, and courier code.",
                    api_key=api_key,
                    tracking_number=tracking_number,
                    courier_code=courier_code,
                )
            )
            return

        try:
            outcome = process_tracking_request(api_key, tracking_number, courier_code)
        except RuntimeError as err:
            details = err.args[0] if err.args else {}
            meta = details.get("meta", {}) if isinstance(details, dict) else {}
            debug = {
                "code": meta.get("code"),
                "type": meta.get("type"),
                "message": meta.get("message", "API request failed."),
            }
            self._send_html(
                render_page(
                    error=f"API error:\n{json.dumps(debug, indent=2)}",
                    api_key=api_key,
                    tracking_number=tracking_number,
                    courier_code=courier_code,
                )
            )
            return

        if not outcome.get("ok"):
            suggestions = outcome.get("suggestions", [])
            suggestion_text = "\n".join(f"- {item}" for item in suggestions) if suggestions else "(no close suggestions)"
            self._send_html(
                render_page(
                    error=f"The value of courier_code is invalid.\nTry:\n{suggestion_text}",
                    api_key=api_key,
                    tracking_number=tracking_number,
                    courier_code=courier_code,
                )
            )
            return

        message = (
            "Tracking created/fetched successfully.\n"
            f"courier_code: {outcome.get('courier_code')}\n"
            f"tracking_number: {outcome.get('tracking_number')}\n"
            f"tag: {outcome.get('tag')}"
        )
        self._send_html(
            render_page(
                message=message,
                api_key=api_key,
                tracking_number=tracking_number,
                courier_code=courier_code,
            )
        )

    def _send_html(self, html_content: str) -> None:
        encoded = html_content.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main() -> None:
    server = HTTPServer((HOST, PORT), Handler)
    print(f"Web UI running at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
