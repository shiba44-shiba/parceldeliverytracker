# Parcel Delivery Tracker

Input-based Python CLI to create/fetch tracking records through the AfterShip API, with courier code validation and alias support.

Also includes a lightweight browser UI.

## Features

- Keeps interactive `input()` flow
- Includes browser UI for easier usage
- Supports both key formats automatically:
	- Legacy keys via `/v4` API (`aftership-api-key` header)
	- New `asat_` keys via `/tracking/2024-07` API (`as-api-key` header)
- Validates `courier_code` against live `/couriers` API data
- Supports common aliases:
	- `cainiao` / `cainiao-global`
	- `imile` / `imili` / `imilie`
	- `australia-post` / `australian-post` / `auspost`
- Case-insensitive input is supported (for example `CAiniao` and `Imilie`)
- Known aliases like `Imilie` and `cainiao` are accepted even if `/couriers` returns a limited list
- Prints API debug details when request fails
- Includes a project logo in `assets/logo.svg`

## Run

CLI:

```bash
python3 tracker.py
```

Web UI:

```bash
python3 web_ui.py
```

Then open:

```text
http://127.0.0.1:8080
```

## Push To GitHub

```bash
git add .
git commit -m "Fix courier handling and add web UI"
git push origin main
```

## Deploy Live Website (Render)

1. Push your repo to GitHub.
2. Go to `https://render.com` and create a **Web Service** from this repo.
3. Use:
	- **Build Command:** *(leave empty)*
	- **Start Command:** `python3 web_ui.py`
4. Add environment variable:
	- `AFTERSHIP_API_KEY=your_key`
5. Deploy. Render will provide a public URL.

The app now supports cloud hosting by using `HOST`/`PORT` environment variables automatically.

Optional env var (so you do not type API key every run):

```bash
export AFTERSHIP_API_KEY="your_api_key_here"
python3 tracker.py
```

## Notes

- If you see `The value of courier_code is invalid`, enter one of the exact slugs suggested by the script.
- If your API key was shared publicly, rotate/regenerate it in your provider dashboard.
- If your key starts with `asat_`, the app now automatically uses the correct AfterShip Tracking API version.
- If AfterShip returns `Tracking already exists`, the app treats it as success and shows the existing record.

## Quick Debug Check

Run this to verify alias normalization locally:

```bash
python3 - <<'PY'
from tracker import normalize_courier_code

valid = {"cainiao", "imile", "australia-post"}
for raw in ["Imilie", "CAiniao"]:
	code, _ = normalize_courier_code(raw, valid)
	print(raw, "=>", code)
PY
```