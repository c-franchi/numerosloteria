"""
Flask application for the Lotofácil number suggestion website.

This simple web app fetches historical draw results from a publicly
available API and calculates suggested plays based on two strategies:

1. **Hot Columns**: Divide the 15 draw numbers into three columns of
   five numbers each (e.g. positions 1‑5, 6‑10, and 11‑15) and find
   the most frequently drawn numbers in each column over a user‑selected
   period. The top five numbers from each column form the suggestion.

2. **Least Frequent**: Across the same period, find the 15 numbers
   that have been drawn the least. This provides an alternative choice
   using “cold” numbers.

The app exposes a web UI at `/` where visitors can choose the period
to analyse and then receive two suggested plays. The backend is
responsible for downloading and caching the lottery results. Because
the official Caixa download is difficult to automate reliably in this
environment, we use a community API (see README) which provides up to
date results. If you wish to change to another source, update the
``RESULTS_API`` constant accordingly.

To run the application:

```bash
pip install flask requests
python app.py
```

Then open http://localhost:5000 in your browser.

"""

from __future__ import annotations

import json
import datetime as dt
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Any

from flask import Flask, render_template, request, jsonify
import requests

app = Flask(__name__, static_url_path='/static')

# URL to fetch all Lotofácil results.
# This API returns a list of draws with fields such as
# ``dezenas`` (sorted numbers) and ``data`` (draw date).
RESULTS_API = "https://loteriascaixa-api.herokuapp.com/api/lotofacil"


@dataclass
class Draw:
    """Represents a single Lotofácil draw."""

    contest: int
    date: dt.date
    numbers: List[int]

    @staticmethod
    def from_api(item: Dict[str, Any]) -> 'Draw':
        """Create a Draw from an API JSON object."""
        contest = int(item.get("concurso"))
        # The API uses DD/MM/YYYY format.
        date = dt.datetime.strptime(item.get("data"), "%d/%m/%Y").date()
        numbers = [int(n) for n in item.get("dezenas", [])]
        return Draw(contest=contest, date=date, numbers=numbers)


def fetch_draws() -> List[Draw]:
    """Download and cache the entire list of Lotofácil draws from the API.

    Returns a list of Draw objects sorted by date ascending.
    """
    try:
        resp = requests.get(RESULTS_API, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        draws = [Draw.from_api(item) for item in data]
        # sort by date ascending
        draws.sort(key=lambda d: d.date)
        return draws
    except Exception as e:
        print(f"Error fetching draws: {e}")
        return []


def filter_draws(draws: List[Draw], period: str) -> List[Draw]:
    """Filter the list of draws based on the period string.

    Supported periods:
      * 'last_month': draws from the last 30 days
      * 'last_week': draws from the last 7 days
      * 'last_10': last 10 draws
      * 'all': all draws

    Args:
        draws: List of Draw objects.
        period: Requested period string from the frontend.

    Returns:
        A filtered list of Draw objects.
    """
    if not draws:
        return []

    today = draws[-1].date  # last draw date serves as 'today'

    if period == 'last_month':
        cutoff = today - dt.timedelta(days=30)
        filtered = [d for d in draws if d.date >= cutoff]
    elif period == 'last_week':
        cutoff = today - dt.timedelta(days=7)
        filtered = [d for d in draws if d.date >= cutoff]
    elif period == 'last_10':
        filtered = draws[-10:] if len(draws) >= 10 else draws
    else:  # 'all'
        filtered = draws
    return filtered


def compute_frequency(draws: List[Draw]) -> Dict[int, int]:
    """Compute how many times each number (1–25) appears in the draws."""
    freq: Dict[int, int] = {n: 0 for n in range(1, 26)}
    for draw in draws:
        for num in draw.numbers:
            freq[num] += 1
    return freq


def compute_column_frequency(draws: List[Draw]) -> List[List[int]]:
    """Compute frequency of numbers per column.

    Each draw has 15 numbers; we divide them into 3 columns of 5 numbers
    based on their position in the sorted list (indices 0–4, 5–9, 10–14).
    We tally frequencies within each column across all draws and then
    return the top 5 numbers for each column.

    Args:
        draws: List of Draw objects.

    Returns:
        A list of three lists, each containing the top 5 numbers for
        that column sorted by descending frequency (ties broken by
        ascending number).
    """
    # Initialise frequency dict for each column
    col_freq: List[Dict[int, int]] = [ {n: 0 for n in range(1, 26)} for _ in range(3) ]
    for draw in draws:
        # Ensure the numbers are sorted to maintain column positions
        sorted_nums = sorted(draw.numbers)
        for col in range(3):
            start = col * 5
            end = start + 5
            for num in sorted_nums[start:end]:
                col_freq[col][num] += 1

    # For each column, get numbers sorted by frequency descending then number ascending
    top_cols: List[List[int]] = []
    for col in range(3):
        items = list(col_freq[col].items())
        # sort by (-frequency, number)
        items.sort(key=lambda kv: (-kv[1], kv[0]))
        top_numbers = [num for num, _ in items[:5]]
        top_cols.append(sorted(top_numbers))  # sort within column ascending
    return top_cols


def compute_least_frequent(draws: List[Draw]) -> List[int]:
    """Compute the 15 least frequent numbers across the draws.

    Returns a sorted list of the 15 numbers with the lowest appearance counts.
    Ties are broken by ascending number.
    """
    freq = compute_frequency(draws)
    items = list(freq.items())
    # sort by (frequency, number)
    items.sort(key=lambda kv: (kv[1], kv[0]))
    least_nums = [num for num, _ in items[:15]]
    return sorted(least_nums)


@app.route('/')
def index() -> str:
    """Render the main page."""
    return render_template('index.html')


@app.route('/api/suggestions')
def api_suggestions() -> Any:
    """Return suggestions based on the selected period.

    The frontend should pass a `period` query parameter with one of
    ``last_month``, ``last_week``, ``last_10`` or ``all``.
    """
    period = request.args.get('period', 'all')
    draws = fetch_draws()
    filtered_draws = filter_draws(draws, period)
    if not filtered_draws:
        return jsonify({"error": "No draw data available."}), 500

    # Strategy 1: top numbers per column
    columns = compute_column_frequency(filtered_draws)
    strategy1 = [num for col in columns for num in col]

    # Strategy 2: least frequent numbers
    strategy2 = compute_least_frequent(filtered_draws)

    return jsonify({
        'strategy1': strategy1,
        'strategy2': strategy2,
        'period': period
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')