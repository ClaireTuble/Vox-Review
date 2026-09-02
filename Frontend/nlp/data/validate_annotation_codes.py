import csv
from pathlib import Path

REQUIRED_COLUMNS = {
    "review_id",
    "raw_review",
    "preprocessed_review",
    "emotion",
    "emotion_code",
    "evaluator_notes",
}

VALID_CODES = {"1", "2", "3", "4", "5", "6"}


def validate_csv(file_path: str | Path) -> bool:
    path = Path(file_path)
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise ValueError(f"{path} is missing a header row.")

        missing = REQUIRED_COLUMNS - set(reader.fieldnames)
        if missing:
            raise ValueError(f"Missing required columns: {sorted(missing)}")

        for row_num, row in enumerate(reader, start=2):
            code = (row.get("emotion_code") or "").strip()
            if code and code not in VALID_CODES:
                raise ValueError(
                    f"Row {row_num}: emotion_code must be one of 1,2,3,4,5,6; got {code!r}."
                )

            final_code = (row.get("final_emotion_code") or "").strip()
            if final_code and final_code not in VALID_CODES:
                raise ValueError(
                    f"Row {row_num}: final_emotion_code must be one of 1,2,3,4,5,6; got {final_code!r}."
                )

    return True


if __name__ == "__main__":
    template_path = Path(__file__).with_name("annotation_template.csv")
    try:
        valid = validate_csv(template_path)
        print(f"Validation passed: {template_path.name} -> {valid}")
    except Exception as exc:
        print(f"Validation failed: {exc}")
        raise SystemExit(1)
