"""Prepare the expert-labeled VoxReview records for future NLP training."""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path

from preprocessing.preprocess import preprocess_review


BASE_DIR = Path(__file__).parent
RAW_PATH = BASE_DIR / "data" / "raw" / "Data_sets_without_Keywords.csv"
PROCESSED_DIR = BASE_DIR / "data" / "processed"
OUTPUT_PATH = PROCESSED_DIR / "voxreview_labeled_clean.csv"
REPORT_PATH = PROCESSED_DIR / "dataset_validation_report.txt"
VALID_CATEGORIES = {str(number) for number in range(1, 7)}


def load_rows() -> tuple[list[str], list[dict[str, str | None]]]:
    with RAW_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return reader.fieldnames or [], list(reader)


def main() -> None:
    columns, rows = load_rows()
    categories = [row.get("Category") for row in rows]
    reviews = [row.get("Review") for row in rows]

    valid_labeled_rows = [
        row for row in rows if row.get("Category") in VALID_CATEGORIES
    ]
    usable_labeled_rows = []
    removal_reasons = Counter()

    for row in valid_labeled_rows:
        review = row.get("Review")
        if review is None:
            removal_reasons["missing Review value"] += 1
            continue
        if review.strip() == "":
            removal_reasons["empty Review value"] += 1
            continue
        usable_labeled_rows.append(row)

    category_counts = Counter(
        row.get("Category") for row in valid_labeled_rows
    )
    review_counts = Counter(review for review in reviews if review is not None)
    duplicate_text_values = sum(
        count > 1 for count in review_counts.values()
    )
    duplicate_rows_beyond_first = sum(
        count - 1 for count in review_counts.values() if count > 1
    )

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["ID", "Review", "Category"])
        writer.writeheader()
        for row in usable_labeled_rows:
            writer.writerow(
                {
                    "ID": row.get("ID", ""),
                    "Review": preprocess_review(row["Review"]),
                    "Category": row["Category"],
                }
            )

    report_lines = [
        "VoxReview Dataset Validation Report",
        "====================================",
        f"Source file: {RAW_PATH}",
        f"Original row count: {len(rows)}",
        f"Original columns: {', '.join(columns)}",
        "",
        "Labels",
        "------",
        f"Valid labeled row count (Category 1-6): {len(valid_labeled_rows)}",
        f"Missing Category: {sum(value is None or value == '' for value in categories)}",
        f"Invalid Category values: {sum(value not in VALID_CATEGORIES and value not in (None, '') for value in categories)}",
        "Category distribution:",
    ]
    report_lines.extend(
        f"  Category {category}: {category_counts.get(category, 0)}"
        for category in sorted(VALID_CATEGORIES, key=int)
    )
    report_lines.extend(
        [
            "",
            "Reviews",
            "--------",
            f"Missing Review values: {sum(value is None for value in reviews)}",
            f"Empty Review values: {sum(value is not None and value.strip() == '' for value in reviews)}",
            f"Duplicate Review text values: {duplicate_text_values}",
            f"Duplicate rows beyond first occurrence: {duplicate_rows_beyond_first}",
            "",
            "Processing",
            "----------",
            f"Rows written to processed dataset: {len(usable_labeled_rows)}",
            f"Rows removed during cleaning: {sum(removal_reasons.values())}",
        ]
    )
    if removal_reasons:
        report_lines.extend(
            f"  Removed {count} row(s): {reason}"
            for reason, count in sorted(removal_reasons.items())
        )
    else:
        report_lines.append("  None; every valid labeled row had a usable Review value.")
    report_lines.extend(
        [
            "",
            "Notes",
            "-----",
            "Category values were retained exactly as present in the raw CSV.",
            "The Emotion Category column was not used as a target.",
            "No train/validation/test split or model training was performed.",
            f"Processed output: {OUTPUT_PATH}",
        ]
    )
    REPORT_PATH.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print(f"Raw rows: {len(rows)}")
    print(f"Valid labeled rows: {len(valid_labeled_rows)}")
    for category in sorted(VALID_CATEGORIES, key=int):
        print(f"Category {category}: {category_counts.get(category, 0)}")
    print(f"Processed rows: {len(usable_labeled_rows)}")
    print(f"Rows removed during cleaning: {sum(removal_reasons.values())}")
    print(f"Output: {OUTPUT_PATH}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()