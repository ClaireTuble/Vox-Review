"""Create deterministic stratified train, validation, and test CSV files."""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path

from sklearn.model_selection import train_test_split


BASE_DIR = Path(__file__).parent
INPUT_PATH = BASE_DIR / "data" / "processed" / "voxreview_labeled_clean.csv"
OUTPUT_DIR = BASE_DIR / "data" / "processed"
SEED = 42
CSV_COLUMNS = ["ID", "Review", "Category"]
VALID_CATEGORIES = {str(number) for number in range(1, 7)}


def read_dataset() -> list[dict[str, str]]:
    with INPUT_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    if not rows or set(rows[0]) != set(CSV_COLUMNS):
        raise ValueError(f"Expected columns {CSV_COLUMNS} in {INPUT_PATH}")
    if any(row.get("Category") not in VALID_CATEGORIES for row in rows):
        raise ValueError("Input contains a Category value outside the exact labels 1-6")
    return rows


def write_split(filename: str, rows: list[dict[str, str]]) -> None:
    with (OUTPUT_DIR / filename).open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def category_counts(rows: list[dict[str, str]]) -> dict[str, int]:
    counts = Counter(row["Category"] for row in rows)
    return {category: counts.get(category, 0) for category in sorted(VALID_CATEGORIES, key=int)}


def main() -> None:
    rows = read_dataset()
    labels = [row["Category"] for row in rows]

    train_rows, temporary_rows = train_test_split(
        rows,
        test_size=0.30,
        random_state=SEED,
        stratify=labels,
    )
    temporary_labels = [row["Category"] for row in temporary_rows]
    validation_rows, test_rows = train_test_split(
        temporary_rows,
        test_size=0.50,
        random_state=SEED,
        stratify=temporary_labels,
    )

    splits = {
        "Training": train_rows,
        "Validation": validation_rows,
        "Test": test_rows,
    }
    for filename, split_rows in (
        ("train.csv", train_rows),
        ("validation.csv", validation_rows),
        ("test.csv", test_rows),
    ):
        write_split(filename, split_rows)

    split_ids = [set(row["ID"] for row in split_rows) for split_rows in splits.values()]
    split_reviews = [
        set(row["Review"] for row in split_rows) for split_rows in splits.values()
    ]
    id_overlap = any(
        split_ids[first] & split_ids[second]
        for first in range(len(split_ids))
        for second in range(first + 1, len(split_ids))
    )
    review_overlap = any(
        split_reviews[first] & split_reviews[second]
        for first in range(len(split_reviews))
        for second in range(first + 1, len(split_reviews))
    )
    total_rows = sum(len(split_rows) for split_rows in splits.values())

    print(f"Input rows: {len(rows)}")
    for split_name, split_rows in splits.items():
        print(f"{split_name} rows: {len(split_rows)}")
        print(f"{split_name} Category distribution: {category_counts(split_rows)}")
    print(f"Total output rows: {total_rows}")
    print(f"ID overlap across splits: {'FAIL' if id_overlap else 'PASS'}")
    print(f"Exact Review overlap across splits: {'FAIL' if review_overlap else 'PASS'}")
    print(f"Total row count check (expected 1425): {'PASS' if total_rows == 1425 else 'FAIL'}")

    if id_overlap or review_overlap or total_rows != len(rows):
        raise RuntimeError("Split validation failed")


if __name__ == "__main__":
    main()