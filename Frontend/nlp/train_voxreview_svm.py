"""Train and evaluate the baseline VoxReview Linear SVM on official CSV splits."""

from __future__ import annotations

import csv
from pathlib import Path

from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    precision_score,
    recall_score,
)

from config import DEFAULT_SVM_CONFIG, DEFAULT_TFIDF_CONFIG
from svm_model import predict_category
from svm_pipeline import build_svm_pipeline, save_svm_model


BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data" / "processed"
MODEL_PATH = BASE_DIR / "models" / "svm_model.joblib"
REPORT_PATH = BASE_DIR / "models" / "svm_training_report.txt"
CATEGORY_CODES = [1, 2, 3, 4, 5, 6]
VALID_CATEGORIES = {str(category) for category in CATEGORY_CODES}


def read_split(filename: str) -> list[dict[str, str]]:
    path = DATA_DIR / filename
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows or set(rows[0]) != {"ID", "Review", "Category"}:
        raise ValueError(f"Unexpected schema in {path}")
    if any(row["Category"] not in VALID_CATEGORIES for row in rows):
        raise ValueError(f"Invalid Category in {path}; expected exact values 1-6")
    return rows


def build_model(c_param: float):
    return build_svm_pipeline(
        feature_type=DEFAULT_TFIDF_CONFIG["feature_type"],
        word_ngram_range=DEFAULT_TFIDF_CONFIG["word_ngram_range"],
        char_ngram_range=DEFAULT_TFIDF_CONFIG["char_ngram_range"],
        min_df=DEFAULT_TFIDF_CONFIG["min_df"],
        max_features_word=DEFAULT_TFIDF_CONFIG["max_features_word"],
        max_features_char=DEFAULT_TFIDF_CONFIG["max_features_char"],
        sublinear_tf=DEFAULT_TFIDF_CONFIG["sublinear_tf"],
        c_param=c_param,
        loss=DEFAULT_SVM_CONFIG["loss"],
        penalty=DEFAULT_SVM_CONFIG["penalty"],
        dual=DEFAULT_SVM_CONFIG["dual"],
        class_weight="balanced",
        random_state=DEFAULT_SVM_CONFIG["random_state"],
        max_iter=DEFAULT_SVM_CONFIG["max_iter"],
        tol=DEFAULT_SVM_CONFIG["tol"],
    )


def evaluate(model, rows: list[dict[str, str]]) -> dict:
    actual = [int(row["Category"]) for row in rows]
    predicted = [int(value) for value in model.predict([row["Review"] for row in rows])]
    precision, recall, f1, support = precision_recall_fscore_support(
        actual,
        predicted,
        labels=CATEGORY_CODES,
        zero_division=0,
    )
    return {
        "accuracy": accuracy_score(actual, predicted),
        "macro_precision": precision_score(actual, predicted, labels=CATEGORY_CODES, average="macro", zero_division=0),
        "macro_recall": recall_score(actual, predicted, labels=CATEGORY_CODES, average="macro", zero_division=0),
        "macro_f1": f1_score(actual, predicted, labels=CATEGORY_CODES, average="macro", zero_division=0),
        "weighted_f1": f1_score(actual, predicted, labels=CATEGORY_CODES, average="weighted", zero_division=0),
        "per_category": {
            str(category): {
                "precision": precision[index],
                "recall": recall[index],
                "f1": f1[index],
                "support": int(support[index]),
            }
            for index, category in enumerate(CATEGORY_CODES)
        },
        "confusion_matrix": confusion_matrix(actual, predicted, labels=CATEGORY_CODES).tolist(),
        "actual": actual,
        "predicted": predicted,
    }


def format_metrics(title: str, metrics: dict) -> list[str]:
    lines = [
        title,
        "-" * len(title),
        f"Accuracy: {metrics['accuracy']:.4f}",
        f"Macro Precision: {metrics['macro_precision']:.4f}",
        f"Macro Recall: {metrics['macro_recall']:.4f}",
        f"Macro F1: {metrics['macro_f1']:.4f}",
        f"Weighted F1: {metrics['weighted_f1']:.4f}",
        "Per-category metrics (Category: Precision, Recall, F1, Support):",
    ]
    lines.extend(
        f"  {category}: {values['precision']:.4f}, {values['recall']:.4f}, {values['f1']:.4f}, {values['support']}"
        for category, values in metrics["per_category"].items()
    )
    lines.append("Confusion matrix (rows=actual, columns=predicted; order 1-6):")
    lines.extend(f"  {row}" for row in metrics["confusion_matrix"])
    return lines


def main() -> None:
    train_rows = read_split("train.csv")
    validation_rows = read_split("validation.csv")
    test_rows = read_split("test.csv")

    train_texts = [row["Review"] for row in train_rows]
    train_labels = [int(row["Category"]) for row in train_rows]

    validation_candidates = []
    for c_param in (0.5, 1.0, 2.0):
        candidate = build_model(c_param)
        candidate.fit(train_texts, train_labels)
        metrics = evaluate(candidate, validation_rows)
        validation_candidates.append((metrics["macro_f1"], c_param, metrics))
    _, selected_c, validation_metrics = max(validation_candidates, key=lambda item: item[0])

    combined_rows = train_rows + validation_rows
    final_model = build_model(selected_c)
    final_model.fit(
        [row["Review"] for row in combined_rows],
        [int(row["Category"]) for row in combined_rows],
    )
    test_metrics = evaluate(final_model, test_rows)
    saved_path = save_svm_model(final_model, MODEL_PATH)

    sample_predictions = []
    for row, predicted in zip(test_rows[:10], test_metrics["predicted"][:10]):
        sample_predictions.append(
            f"Review: {row['Review']}\nActual Category: {row['Category']}\nPredicted Category: {predicted}\n"
            f"Result: {'Correct' if int(row['Category']) == predicted else 'Incorrect'}"
        )

    report_lines = [
        "VoxReview Linear SVM Baseline Report",
        "====================================",
        "Model: Existing LinearSVC pipeline with word and character TF-IDF",
        "Class balancing: class_weight='balanced'",
        f"Selected C using validation Macro F1: {selected_c}",
        f"Training rows: {len(train_rows)}",
        f"Validation rows: {len(validation_rows)}",
        f"Test rows: {len(test_rows)}",
        "",
    ]
    report_lines.extend(format_metrics("Validation metrics", validation_metrics))
    report_lines.extend(["", "Final test metrics"])
    report_lines.extend(format_metrics("Final test metrics", test_metrics))
    report_lines.extend(["", "Real test-set sample predictions", "-------------------------------"])
    report_lines.extend(sample_predictions)
    report_lines.extend(
        [
            "",
            f"Saved model: {saved_path}",
            "The test set was evaluated once after retraining on train plus validation.",
            "No SVM, LSTM, or XLM-R training was performed beyond this SVM baseline.",
        ]
    )
    REPORT_PATH.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print("Selected configuration:")
    print(f"  C={selected_c}, class_weight=balanced, TF-IDF=word+character")
    print(f"Training rows: {len(train_rows)}")
    print(f"Validation rows: {len(validation_rows)}")
    print(f"Test rows: {len(test_rows)}")
    print(*format_metrics("Validation metrics", validation_metrics), sep="\n")
    print(*format_metrics("Final test metrics", test_metrics), sep="\n")
    print("Real test-set sample predictions:")
    print(*sample_predictions, sep="\n\n")
    print(f"Saved model: {saved_path}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()