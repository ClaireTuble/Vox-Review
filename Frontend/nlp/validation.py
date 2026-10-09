"""
VoxReview NLP Dataset Validation Module

Validates dataset integrity, emotion codes, required fields, duplicates,
and provides detailed validation reports.
"""

from typing import List, Dict, Set, Tuple, Any, Optional
from dataclasses import dataclass, field
import csv
from pathlib import Path

from config import (
    VALID_EMOTION_CODES,
    VALID_EMOTION_LABELS,
    EMOTION_CODE_TO_LABEL,
    REQUIRED_COLUMNS,
    RECOMMENDED_COLUMNS,
    normalize_emotion_code,
)


# ==============================================================================
# DATA CLASSES FOR VALIDATION RESULTS
# ==============================================================================

@dataclass
class ValidationError:
    """Single validation error."""
    row_number: int
    review_id: Any
    field: str
    message: str


@dataclass
class ValidationResult:
    """Complete validation result for a dataset."""
    is_valid: bool = True
    errors: List[ValidationError] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)
    
    def add_error(self, row_num: int, review_id: Any, field: str, message: str):
        """Add a validation error."""
        self.errors.append(ValidationError(row_num, review_id, field, message))
        self.is_valid = False
    
    def add_warning(self, message: str):
        """Add a warning."""
        self.warnings.append(message)


@dataclass
class DatasetSummary:
    """Statistical summary of dataset."""
    total_rows: int = 0
    valid_rows: int = 0
    invalid_rows: int = 0
    
    # Class distribution
    class_counts: Dict[str, int] = field(default_factory=dict)
    class_percentages: Dict[str, float] = field(default_factory=dict)
    
    # Missing values
    missing_raw_reviews: int = 0
    missing_emotion_codes: int = 0
    invalid_emotion_codes: int = 0
    
    # Duplicates
    exact_duplicates: List[List[int]] = field(default_factory=list)
    near_duplicates: List[Tuple[int, int, float]] = field(default_factory=list)
    
    # Additional metadata
    min_review_length: int = 0
    max_review_length: int = 0
    avg_review_length: float = 0.0


# ==============================================================================
# VALIDATION FUNCTIONS
# ==============================================================================

def validate_required_columns(fieldnames: List[str]) -> Tuple[bool, List[str]]:
    """
    Validate that all required columns exist.
    
    Returns:
        (is_valid, list_of_missing_columns)
    """
    if fieldnames is None:
        return False, list(REQUIRED_COLUMNS)
    
    fieldnames_set = set(fieldnames)
    missing = REQUIRED_COLUMNS - fieldnames_set
    
    return len(missing) == 0, list(missing)


def validate_emotion_code(code: Any) -> Tuple[bool, Optional[str]]:
    """
    Validate emotion code.
    
    Returns:
        (is_valid, normalized_code_or_none)
    """
    normalized = normalize_emotion_code(code)
    return normalized is not None, normalized


def validate_raw_review(raw_review: Any) -> bool:
    """Check if raw_review is present and non-empty."""
    if raw_review is None:
        return False
    if isinstance(raw_review, str) and len(raw_review.strip()) == 0:
        return False
    return True


def validate_emotion_code_in_range(code: Any) -> bool:
    """Check if emotion code is in valid range."""
    if code is None:
        return False
    try:
        code_int = int(code)
        return code_int in VALID_EMOTION_CODES
    except (ValueError, TypeError):
        return False


def calculate_string_similarity(s1: str, s2: str) -> float:
    """
    Simple similarity metric between two strings (0.0 to 1.0).
    
    Uses character overlap ratio as a basic similarity measure.
    Higher value = more similar.
    """
    if not s1 or not s2:
        return 0.0
    
    s1_chars = set(s1.lower())
    s2_chars = set(s2.lower())
    
    if len(s1_chars) == 0 and len(s2_chars) == 0:
        return 1.0
    
    intersection = len(s1_chars & s2_chars)
    union = len(s1_chars | s2_chars)
    
    if union == 0:
        return 0.0
    
    return intersection / union


# ==============================================================================
# MAIN VALIDATOR CLASS
# ==============================================================================

class DatasetValidator:
    """Comprehensive dataset validator."""
    
    def __init__(self):
        """Initialize validator."""
        self.result = ValidationResult()
        self.summary = DatasetSummary()
    
    def validate_file(self, filepath: str) -> ValidationResult:
        """
        Validate a CSV dataset file.
        
        Args:
            filepath: Path to CSV file
        
        Returns:
            ValidationResult with detailed errors and warnings
        """
        self.result = ValidationResult()
        self.summary = DatasetSummary()
        
        filepath_obj = Path(filepath)
        
        if not filepath_obj.exists():
            self.result.add_error(0, None, "file", f"File not found: {filepath}")
            return self.result
        
        try:
            with open(filepath_obj, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                
                # Validate columns
                if reader.fieldnames is None:
                    self.result.add_error(0, None, "columns", "CSV file is empty")
                    return self.result
                
                is_valid, missing = validate_required_columns(reader.fieldnames)
                if not is_valid:
                    for col in missing:
                        self.result.add_error(0, None, col, f"Required column missing: {col}")
                    return self.result
                
                # Validate rows
                raw_reviews = []
                emotion_codes = []
                review_ids = set()
                
                for row_num, row in enumerate(reader, start=2):  # start=2 because row 1 is header
                    self.summary.total_rows += 1
                    
                    review_id = row.get("review_id")
                    raw_review = row.get("raw_review")
                    emotion_code = row.get("emotion_code")
                    emotion = row.get("emotion")
                    
                    row_is_valid = True
                    
                    # Check for duplicate review_id
                    if review_id and review_id in review_ids:
                        self.result.add_error(
                            row_num, review_id, "review_id",
                            f"Duplicate review_id: {review_id}"
                        )
                        row_is_valid = False
                    elif review_id:
                        review_ids.add(review_id)
                    
                    # Validate raw_review
                    if not validate_raw_review(raw_review):
                        self.result.add_error(
                            row_num, review_id, "raw_review",
                            "Raw review is missing or empty"
                        )
                        self.summary.missing_raw_reviews += 1
                        row_is_valid = False
                    else:
                        raw_reviews.append((row_num, raw_review))
                    
                    # Validate emotion_code
                    if emotion_code is None or emotion_code == "":
                        self.result.add_error(
                            row_num, review_id, "emotion_code",
                            "Emotion code is missing"
                        )
                        self.summary.missing_emotion_codes += 1
                        row_is_valid = False
                    else:
                        is_code_valid, normalized_code = validate_emotion_code(emotion_code)
                        if not is_code_valid:
                            self.result.add_error(
                                row_num, review_id, "emotion_code",
                                f"Invalid emotion code: {emotion_code}. Valid codes: {', '.join(map(str, sorted(VALID_EMOTION_CODES)))}"
                            )
                            self.summary.invalid_emotion_codes += 1
                            row_is_valid = False
                        else:
                            emotion_codes.append((row_num, normalized_code))
                            # Track class distribution
                            label = EMOTION_CODE_TO_LABEL.get(normalized_code)
                            if label:
                                self.summary.class_counts[label] = self.summary.class_counts.get(label, 0) + 1
                    
                    # Validate emotion label consistency
                    if emotion and isinstance(emotion, str) and emotion not in VALID_EMOTION_LABELS:
                        self.result.add_warning(
                            f"Row {row_num}: Invalid emotion label: {emotion}. "
                            f"Expected one of: {', '.join(sorted(VALID_EMOTION_LABELS))}"
                        )
                    
                    if row_is_valid:
                        self.summary.valid_rows += 1
                    else:
                        self.summary.invalid_rows += 1
                
                # Calculate class percentages
                if self.summary.valid_rows > 0:
                    for label, count in self.summary.class_counts.items():
                        pct = (count / self.summary.valid_rows) * 100
                        self.summary.class_percentages[label] = pct
                
                # Check for exact duplicates in raw_reviews
                self._check_exact_duplicates(raw_reviews)
                
                # Check for near-duplicates (optional, can be resource-intensive)
                # self._check_near_duplicates(raw_reviews)
        
        except Exception as e:
            self.result.add_error(0, None, "file", f"Error reading file: {str(e)}")
        
        # Final validation status
        self.result.is_valid = len(self.result.errors) == 0
        self.result.summary = {
            "total_rows": self.summary.total_rows,
            "valid_rows": self.summary.valid_rows,
            "invalid_rows": self.summary.invalid_rows,
            "class_counts": self.summary.class_counts,
            "class_percentages": self.summary.class_percentages,
            "missing_raw_reviews": self.summary.missing_raw_reviews,
            "missing_emotion_codes": self.summary.missing_emotion_codes,
            "invalid_emotion_codes": self.summary.invalid_emotion_codes,
            "exact_duplicates": len(self.summary.exact_duplicates),
        }
        
        return self.result
    
    def _check_exact_duplicates(self, raw_reviews: List[Tuple[int, str]]):
        """Check for exact duplicate raw reviews."""
        seen = {}
        for row_num, review in raw_reviews:
            normalized = review.strip().lower() if isinstance(review, str) else review
            if normalized in seen:
                if normalized not in [dup[0] for dup in self.summary.exact_duplicates]:
                    self.summary.exact_duplicates.append([seen[normalized], row_num])
                else:
                    # Add to existing duplicate group
                    for dup_group in self.summary.exact_duplicates:
                        if seen[normalized] in dup_group and row_num not in dup_group:
                            dup_group.append(row_num)
            else:
                seen[normalized] = row_num
    
    def _check_near_duplicates(self, raw_reviews: List[Tuple[int, str]], threshold: float = 0.85):
        """Check for near-duplicate raw reviews (resource-intensive)."""
        for i, (row_i, review_i) in enumerate(raw_reviews):
            for row_j, review_j in raw_reviews[i + 1:]:
                if isinstance(review_i, str) and isinstance(review_j, str):
                    similarity = calculate_string_similarity(review_i, review_j)
                    if similarity >= threshold:
                        self.summary.near_duplicates.append((row_i, row_j, similarity))


# ==============================================================================
# UTILITY FUNCTIONS FOR VALIDATION REPORTING
# ==============================================================================

def print_validation_result(result: ValidationResult):
    """Print a human-readable validation report."""
    print("\n" + "=" * 80)
    print("DATASET VALIDATION REPORT")
    print("=" * 80)
    
    if result.is_valid:
        print("\n✓ VALIDATION PASSED")
    else:
        print("\n✗ VALIDATION FAILED")
    
    # Print errors
    if result.errors:
        print(f"\nErrors ({len(result.errors)}):")
        for error in result.errors[:10]:  # Show first 10 errors
            print(f"  Row {error.row_number} (ID: {error.review_id})")
            print(f"    Field: {error.field}")
            print(f"    {error.message}")
        
        if len(result.errors) > 10:
            print(f"\n  ... and {len(result.errors) - 10} more errors")
    
    # Print warnings
    if result.warnings:
        print(f"\nWarnings ({len(result.warnings)}):")
        for warning in result.warnings[:5]:
            print(f"  {warning}")
        
        if len(result.warnings) > 5:
            print(f"  ... and {len(result.warnings) - 5} more warnings")
    
    # Print summary
    if result.summary:
        print(f"\nSummary:")
        print(f"  Total Rows: {result.summary.get('total_rows', 0)}")
        print(f"  Valid Rows: {result.summary.get('valid_rows', 0)}")
        print(f"  Invalid Rows: {result.summary.get('invalid_rows', 0)}")
        print(f"  Exact Duplicates: {result.summary.get('exact_duplicates', 0)}")
    
    print("\n" + "=" * 80)


def print_dataset_summary(summary: DatasetSummary):
    """Print a human-readable dataset summary."""
    print("\n" + "=" * 80)
    print("DATASET SUMMARY")
    print("=" * 80)
    
    print(f"\nTotal Rows: {summary.total_rows}")
    print(f"Valid Rows: {summary.valid_rows}")
    print(f"Invalid Rows: {summary.invalid_rows}")
    
    print(f"\nClass Distribution:")
    for label in sorted(summary.class_counts.keys()):
        count = summary.class_counts[label]
        pct = summary.class_percentages.get(label, 0.0)
        print(f"  {label:12} {count:5} ({pct:5.1f}%)")
    
    print(f"\nData Quality:")
    print(f"  Missing Raw Reviews: {summary.missing_raw_reviews}")
    print(f"  Missing Emotion Codes: {summary.missing_emotion_codes}")
    print(f"  Invalid Emotion Codes: {summary.invalid_emotion_codes}")
    
    if summary.exact_duplicates:
        print(f"\nExact Duplicates: {len(summary.exact_duplicates)}")
        for dup_group in summary.exact_duplicates[:5]:
            print(f"  Rows: {', '.join(map(str, dup_group))}")
        if len(summary.exact_duplicates) > 5:
            print(f"  ... and {len(summary.exact_duplicates) - 5} more duplicate groups")
    
    print("\n" + "=" * 80)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
        validator = DatasetValidator()
        result = validator.validate_file(filepath)
        print_validation_result(result)
        print_dataset_summary(validator.summary)
    else:
        print("Usage: python validation.py <path_to_csv>")
