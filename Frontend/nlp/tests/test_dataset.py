"""
Comprehensive tests for Dataset Loader and Validation module.

Tests ensure:
- Dataset loading works correctly
- Validation catches errors and inconsistencies
- Preprocessing is applied correctly
- Raw reviews are preserved
- Label consistency is maintained
- Development fixture loads successfully
"""

import sys
from pathlib import Path
import csv
import tempfile

# Add NLP module to path
NLP_DIR = Path(__file__).parent.parent  # Go up one level to NLP directory
sys.path.insert(0, str(NLP_DIR))
sys.path.insert(0, str(NLP_DIR / "preprocessing"))  # For preprocess module

from config import (
    EMOTION_LABEL_TO_CODE,
    EMOTION_CODE_TO_LABEL,
    VALID_EMOTION_CODES,
    normalize_emotion_code,
)
from validation import (
    validate_required_columns,
    validate_emotion_code,
    validate_raw_review,
    DatasetValidator,
)
from dataset import DatasetLoader, load_dataset
from fixture import create_fixture, FIXTURE_DATA


# ==============================================================================
# SECTION 1: LABEL CONSISTENCY TESTS
# ==============================================================================

def test_label_consistency():
    """Verify emotion label mapping is consistent."""
    # Check bidirectional consistency
    for label, code in EMOTION_LABEL_TO_CODE.items():
        assert EMOTION_CODE_TO_LABEL[code] == label, f"Inconsistent mapping for {label}→{code}"
    
    # Check valid codes
    for code in VALID_EMOTION_CODES:
        assert code in EMOTION_CODE_TO_LABEL, f"Code {code} not in reverse mapping"
    
    print("✓ Label consistency test passed")


def test_label_normalization():
    """Test normalize_emotion_code function."""
    # String to int conversion
    assert normalize_emotion_code("1") == 1
    assert normalize_emotion_code("6") == 6
    
    # Label to code conversion
    assert normalize_emotion_code("Happy") == 1
    assert normalize_emotion_code("Sad") == 2
    assert normalize_emotion_code("Sarcastic") == 6
    
    # Int passthrough
    assert normalize_emotion_code(3) == 3
    
    # Invalid values
    assert normalize_emotion_code("Invalid") is None
    assert normalize_emotion_code(0) is None
    assert normalize_emotion_code(7) is None
    assert normalize_emotion_code("") is None
    assert normalize_emotion_code(None) is None
    
    print("✓ Label normalization test passed")


# ==============================================================================
# SECTION 2: FIELD VALIDATION TESTS
# ==============================================================================

def test_required_columns_validation():
    """Test required columns validation."""
    # Valid columns
    valid_columns = ["review_id", "raw_review", "emotion_code", "emotion"]
    is_valid, missing = validate_required_columns(valid_columns)
    assert is_valid, f"Should be valid, missing: {missing}"
    assert missing == []
    
    # Missing required column
    missing_code = ["review_id", "raw_review", "emotion"]
    is_valid, missing = validate_required_columns(missing_code)
    assert not is_valid, "Should be invalid"
    assert "emotion_code" in missing
    
    # Empty fieldnames
    is_valid, missing = validate_required_columns([])
    assert not is_valid
    assert len(missing) == 3
    
    # None fieldnames
    is_valid, missing = validate_required_columns(None)
    assert not is_valid
    
    print("✓ Required columns validation test passed")


def test_emotion_code_validation():
    """Test emotion code validation."""
    # Valid codes
    for code in VALID_EMOTION_CODES:
        is_valid, normalized = validate_emotion_code(code)
        assert is_valid, f"Code {code} should be valid"
        assert normalized == code
    
    # Invalid codes
    for invalid in [0, 7, 8, "Invalid", None, ""]:
        is_valid, normalized = validate_emotion_code(invalid)
        assert not is_valid, f"Code {invalid} should be invalid"
        assert normalized is None
    
    # String to code conversion
    is_valid, normalized = validate_emotion_code("Happy")
    assert is_valid
    assert normalized == 1
    
    print("✓ Emotion code validation test passed")


def test_raw_review_validation():
    """Test raw review validation."""
    # Valid reviews
    assert validate_raw_review("This is a valid review")
    assert validate_raw_review("GANDAAAA!!! 😭")
    
    # Invalid reviews
    assert not validate_raw_review("")
    assert not validate_raw_review("   ")
    assert not validate_raw_review(None)
    
    print("✓ Raw review validation test passed")


# ==============================================================================
# SECTION 3: FILE VALIDATION TESTS
# ==============================================================================

def test_valid_dataset():
    """Test validation of a valid dataset."""
    # Create temporary valid CSV
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
        fieldnames = ["review_id", "raw_review", "emotion_code", "emotion"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerow({
            "review_id": "1",
            "raw_review": "Great product!",
            "emotion_code": "1",
            "emotion": "Happy"
        })
        writer.writerow({
            "review_id": "2",
            "raw_review": "Bad quality",
            "emotion_code": "2",
            "emotion": "Sad"
        })
        temp_path = f.name
    
    try:
        validator = DatasetValidator()
        result = validator.validate_file(temp_path)
        assert result.is_valid, f"Valid dataset should pass. Errors: {result.errors}"
        assert result.summary["total_rows"] == 2
        assert result.summary["valid_rows"] == 2
        print("✓ Valid dataset test passed")
    finally:
        Path(temp_path).unlink()


def test_invalid_emotion_code():
    """Test detection of invalid emotion codes."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
        fieldnames = ["review_id", "raw_review", "emotion_code", "emotion"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerow({
            "review_id": "1",
            "raw_review": "Valid review",
            "emotion_code": "7",  # Invalid code
            "emotion": "Happy"
        })
        temp_path = f.name
    
    try:
        validator = DatasetValidator()
        result = validator.validate_file(temp_path)
        assert not result.is_valid, "Should fail with invalid code"
        assert len(result.errors) > 0, "Should have errors"
        print("✓ Invalid emotion code test passed")
    finally:
        Path(temp_path).unlink()


def test_missing_required_column():
    """Test detection of missing required columns."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
        # Missing emotion_code column
        fieldnames = ["review_id", "raw_review", "emotion"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerow({
            "review_id": "1",
            "raw_review": "Valid review",
            "emotion": "Happy"
        })
        temp_path = f.name
    
    try:
        validator = DatasetValidator()
        result = validator.validate_file(temp_path)
        assert not result.is_valid, "Should fail with missing column"
        print("✓ Missing required column test passed")
    finally:
        Path(temp_path).unlink()


def test_empty_raw_review():
    """Test detection of empty raw reviews."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
        fieldnames = ["review_id", "raw_review", "emotion_code", "emotion"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerow({
            "review_id": "1",
            "raw_review": "",  # Empty
            "emotion_code": "1",
            "emotion": "Happy"
        })
        temp_path = f.name
    
    try:
        validator = DatasetValidator()
        result = validator.validate_file(temp_path)
        assert not result.is_valid, "Should fail with empty review"
        assert result.summary["missing_raw_reviews"] > 0
        print("✓ Empty raw review test passed")
    finally:
        Path(temp_path).unlink()


def test_exact_duplicate_detection():
    """Test detection of exact duplicate raw reviews."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
        fieldnames = ["review_id", "raw_review", "emotion_code", "emotion"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerow({
            "review_id": "1",
            "raw_review": "Duplicate review text",
            "emotion_code": "1",
            "emotion": "Happy"
        })
        writer.writerow({
            "review_id": "2",
            "raw_review": "Duplicate review text",  # Same as above
            "emotion_code": "2",
            "emotion": "Sad"
        })
        temp_path = f.name
    
    try:
        validator = DatasetValidator()
        result = validator.validate_file(temp_path)
        # Should still be valid but report duplicates
        assert len(validator.summary.exact_duplicates) > 0, "Should detect duplicates"
        print("✓ Exact duplicate detection test passed")
    finally:
        Path(temp_path).unlink()


# ==============================================================================
# SECTION 4: DATASET LOADER TESTS
# ==============================================================================

def test_raw_review_preservation():
    """Test that raw reviews are preserved exactly during loading."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
        fieldnames = ["review_id", "raw_review", "emotion_code", "emotion"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        raw_text = "SOBRANG GANDAAAA!!! hnd ko expect 😭❤️"
        writer.writerow({
            "review_id": "1",
            "raw_review": raw_text,
            "emotion_code": "1",
            "emotion": "Happy"
        })
        temp_path = f.name
    
    try:
        loader = DatasetLoader(validate=False, apply_preprocessing=True)
        dataset, _ = loader.load(temp_path)
        
        assert len(dataset) == 1
        assert dataset[0].raw_review == raw_text, "Raw review was modified!"
        print("✓ Raw review preservation test passed")
    finally:
        Path(temp_path).unlink()


def test_preprocessing_integration():
    """Test that preprocessing generates both heavy and light versions."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
        fieldnames = ["review_id", "raw_review", "emotion_code", "emotion"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerow({
            "review_id": "1",
            "raw_review": "GANDAAAA!!! hnd ko :)",
            "emotion_code": "1",
            "emotion": "Happy"
        })
        temp_path = f.name
    
    try:
        loader = DatasetLoader(validate=False, apply_preprocessing=True)
        dataset, _ = loader.load(temp_path)
        
        review = dataset[0]
        # Verify raw is preserved
        assert review.raw_review == "GANDAAAA!!! hnd ko :)"
        # Verify preprocessing happened
        assert len(review.preprocessed_review_heavy) > 0, "Heavy preprocessing not applied"
        assert len(review.preprocessed_review_light) > 0, "Light preprocessing not applied"
        # Heavy should be more aggressive (lowercase, normalized emoticons)
        assert review.preprocessed_review_heavy != review.raw_review
        
        print("✓ Preprocessing integration test passed")
    finally:
        Path(temp_path).unlink()


def test_class_distribution():
    """Test class distribution calculation."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, encoding='utf-8') as f:
        fieldnames = ["review_id", "raw_review", "emotion_code", "emotion"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for i in range(1, 4):
            writer.writerow({
                "review_id": str(i),
                "raw_review": f"Review {i}",
                "emotion_code": "1",
                "emotion": "Happy"
            })
        for i in range(4, 6):
            writer.writerow({
                "review_id": str(i),
                "raw_review": f"Review {i}",
                "emotion_code": "2",
                "emotion": "Sad"
            })
        temp_path = f.name
    
    try:
        loader = DatasetLoader(validate=False, apply_preprocessing=False)
        dataset, _ = loader.load(temp_path)
        
        distribution = dataset.get_class_distribution()
        assert distribution["Happy"] == 3
        assert distribution["Sad"] == 2
        print("✓ Class distribution test passed")
    finally:
        Path(temp_path).unlink()


# ==============================================================================
# SECTION 5: DEVELOPMENT FIXTURE TESTS
# ==============================================================================

def test_fixture_data_completeness():
    """Test that fixture has correct number of examples."""
    assert len(FIXTURE_DATA) == 30, "Fixture should have 30 reviews (5 per class)"
    
    # Count per class
    counts = {}
    for item in FIXTURE_DATA:
        code = item["emotion_code"]
        counts[code] = counts.get(code, 0) + 1
    
    for code in range(1, 7):
        assert counts[code] == 5, f"Class {code} should have 5 examples"
    
    print("✓ Fixture data completeness test passed")


def test_fixture_diversity():
    """Test that fixture includes diverse examples."""
    # Check for various phenomena in fixture
    phenomena = {
        "taglish": False,
        "abbreviations": False,
        "repeated_letters": False,
        "emojis": False,
        "emoticons": False,
        "misspellings": False,
    }
    
    for item in FIXTURE_DATA:
        review = item["raw_review"].lower()
        
        # Check for phenomena
        if "ko" in review or "ng" in review or "talaga" in review:
            phenomena["taglish"] = True
        if any(abbr in review for abbr in ["hnd", "lng", "ung", "di"]):
            phenomena["abbreviations"] = True
        if any(char * 3 in review for char in "abcdefghijklmnopqrstuvwxyz"):
            phenomena["repeated_letters"] = True
        if any(emoji in item["raw_review"] for emoji in "😭❤️😍😡😒😨😰🙄😷"):
            phenomena["emojis"] = True
        if any(emo in review for emo in [":)", ":(", "<3", ":@", ":/"]):
            phenomena["emoticons"] = True
        if any(mis in review for mis in ["pangettt", "parfect", "basaag"]):
            phenomena["misspellings"] = True
    
    for phenom, found in phenomena.items():
        assert found, f"Fixture missing {phenom} examples"
    
    print("✓ Fixture diversity test passed")


def test_fixture_creation():
    """Test that fixture can be created successfully."""
    with tempfile.TemporaryDirectory() as tmpdir:
        fixture_path = Path(tmpdir) / "test_fixture.csv"
        create_fixture(str(fixture_path))
        
        assert fixture_path.exists(), "Fixture file not created"
        
        # Verify it can be loaded
        with open(fixture_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            assert len(rows) == 30, "Fixture should have 30 rows"
        
        print("✓ Fixture creation test passed")


# ==============================================================================
# TEST RUNNER
# ==============================================================================

def run_all_tests():
    """Run all tests and report results."""
    tests = [
        # Label consistency
        test_label_consistency,
        test_label_normalization,
        
        # Field validation
        test_required_columns_validation,
        test_emotion_code_validation,
        test_raw_review_validation,
        
        # File validation
        test_valid_dataset,
        test_invalid_emotion_code,
        test_missing_required_column,
        test_empty_raw_review,
        test_exact_duplicate_detection,
        
        # Dataset loader
        test_raw_review_preservation,
        test_preprocessing_integration,
        test_class_distribution,
        
        # Fixture
        test_fixture_data_completeness,
        test_fixture_diversity,
        test_fixture_creation,
    ]
    
    passed = 0
    failed = 0
    errors = []
    
    print("\n" + "=" * 80)
    print("DATASET LOADER & VALIDATION TESTS")
    print("=" * 80 + "\n")
    
    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            failed += 1
            errors.append((test.__name__, str(e)))
            print(f"✗ {test.__name__}: {e}")
        except Exception as e:
            failed += 1
            errors.append((test.__name__, f"Unexpected error: {str(e)}"))
            print(f"✗ {test.__name__} (ERROR): {e}")
    
    print("\n" + "=" * 80)
    print(f"RESULTS: {passed} passed, {failed} failed out of {len(tests)} tests")
    print("=" * 80)
    
    if errors:
        print("\nFAILURES:")
        for test_name, error_msg in errors:
            print(f"\n{test_name}:")
            print(f"  {error_msg}")
        return False
    
    return True


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
