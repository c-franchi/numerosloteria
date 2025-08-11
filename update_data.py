"""
Script to download all Lotofácil results and save them to a local JSON file.

Usage:
    python3 update_data.py

This script fetches the list of draws from the public API provided by
https://loteriascaixa-api.herokuapp.com/api/lotofacil and stores the
result in the ``data/draws.json`` file within the same directory.

The JSON structure is an array of objects containing at least the
following fields for each draw:
    - concurso: draw number
    - data: date in DD/MM/YYYY format
    - dezenas: list of 15 drawn numbers in ascending order

The resulting file can be consumed by the frontend JavaScript code in
``main.js``, which performs the frequency analysis and number
suggestions.
"""

import json
import pathlib
import requests


RESULTS_API = "https://loteriascaixa-api.herokuapp.com/api/lotofacil"

def main() -> None:
    dest = pathlib.Path(__file__).resolve().parent / 'data' / 'draws.json'
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        print("Fetching results from API...", end='', flush=True)
        resp = requests.get(RESULTS_API, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        # Save only necessary fields to keep file small
        cleaned = [
            {
                'concurso': int(item.get('concurso')),
                'data': item.get('data'),
                'dezenas': [int(n) for n in item.get('dezenas', [])],
            }
            for item in data
        ]
        with dest.open('w', encoding='utf-8') as f:
            json.dump(cleaned, f, ensure_ascii=False, indent=2)
        print("Done! Saved to", dest)
    except Exception as e:
        print("\nError downloading data:", e)


if __name__ == '__main__':
    main()