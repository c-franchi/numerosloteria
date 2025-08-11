# update_data.py
import json, os, sys
from pathlib import Path
import requests

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
OUT_FILE = DATA_DIR / "draws.json"

API_URL = "https://loteriascaixa-api.herokuapp.com/api/lotofacil"

def update_draws():
    try:
        print("Fetching results from API...", end="", flush=True)
        resp = requests.get(API_URL, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        # Espera array de objetos com campos: concurso, data, dezenas (strings/nums)
        with open(OUT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        msg = f"Done! Saved to {OUT_FILE}"
        print(msg)
        return True, msg
    except Exception as e:
        msg = f"Update failed: {e}"
        print("\n" + msg, file=sys.stderr)
        return False, msg

if __name__ == "__main__":
    ok, msg = update_draws()
    sys.exit(0 if ok else 1)
