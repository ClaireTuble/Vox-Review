"""
VoxReview NLP Dataset Loader

Loads and preprocesses emotion-annotated review datasets for ML training.
Integrates with the preprocessing pipeline to apply heavy/light normalization.
"""

import csv
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, field

from config import (
    REQUIRED_COLUMNS,
    EMOTION_CODE_TO_LABEL,
    normalize_emotion_code,
    PREPROCESSING_HEAVY_CONFIG,
    PREPROCESSING_LIGHT_CONFIG,
)
from validation import DatasetValidator, print_validation_result, print_dataset_summary


# Import preprocessing pipeline
try:
    from preprocessing.preprocess import preprocess_review
except ImportError:
    # Fallback for different import contexts
    import sys
    sys.path.insert(0, str(Path(__file__).parent / "preprocessing"))
    from preprocess import preprocess_review


# ==============================================================================
# DATA CLASSES
# ==============================================================================

@dataclass
class Review:
    """Single review record."""
    review_id: str
    raw_review: str
    emotion_code: int
    emotion_label: str = ""
    evaluator_notes: str = ""
    preprocessed_review_heavy: str = ""
    preprocessed_review_light: str = ""
    
    def __post_init__(self):
        """Post-initialization processing."""
        if self.emotion_code and not self.emotion_label:
            self.emotion_label = EMOTION_CODE_TO_LABEL.get(self.emotion_code, "")


@dataclass
class Dataset:
    """Complete dataset."""
    reviews: List[Review] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __len__(self):
        return len(self.reviews)
    
    def __getitem__(self, index: int) -> Review:
        return self.reviews[index]
    
    def to_dict_list(self) -> List[Dict[str, Any]]:
        """Convert to list of dictionaries."""
        return [
            {
                "review_id": r.review_id,
                "raw_review": r.raw_review,
                "emotion_code": r.emotion_code,
                "emotion_label": r.emotion_label,
                "preprocessed_heavy": r.preprocessed_review_heavy,
                "preprocessed_light": r.preprocessed_review_light,
                "evaluator_notes": r.evaluator_notes,
            }
            for r in self.reviews
        ]
    
    def get_class_distribution(self) -> Dict[str, int]:
        """Get count of reviews per emotion class."""
        distribution = {}
        for review in self.reviews:
            label = review.emotion_label
            distribution[label] = distribution.get(label, 0) + 1
        return distribution
    
    def get_by_emotion(self, emotion_code: int) -> List[Review]:
        """Get all reviews for a specific emotion code."""
        return [r for r in self.reviews if r.emotion_code == emotion_code]


# ==============================================================================
# DATASET LOADER
# ==============================================================================

class DatasetLoader:
    """Load and preprocess emotion-annotated datasets."""
    
    def __init__(self, validate: bool = True, apply_preprocessing: bool = True):
        """
        Initialize dataset loader.
        
        Args:
            validate: If True, validate dataset after loading (default: True)
            apply_preprocessing: If True, apply preprocessing to raw reviews (default: True)
        """
        self.validate = validate
        self.apply_preprocessing = apply_preprocessing
        self.validator = None
    
    def load(self, filepath: str) -> Tuple[Dataset, Optional[Dict[str, Any]]]:
        """
        Load dataset from CSV file.
        
        Args:
            filepath: Path to CSV file
        
        Returns:
            (Dataset, validation_result_dict or None)
        
        Raises:
            ValueError: If validation fails and self.validate is True
        """
        filepath_obj = Path(filepath)
        
        if not filepath_obj.exists():
            raise FileNotFoundError(f"Dataset file not found: {filepath}")
        
        # Validate first if requested
        validation_info = None
        if self.validate:
            self.validator = DatasetValidator()
            result = self.validator.validate_file(filepath)
            validation_info = result.summary
            
            if not result.is_valid:
                print_validation_result(result)
                raise ValueError(f"Dataset validation failed with {len(result.errors)} errors")
        
        # Load data
        dataset = Dataset()
        
        with open(filepath_obj, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            for row_num, row in enumerate(reader, start=2):
                try:
                    review_id = row.get("review_id")
                    raw_review = row.get("raw_review", "")
                    emotion_code = row.get("emotion_code")
                    evaluator_notes = row.get("evaluator_notes", "")
                    
                    # Normalize emotion code
                    emotion_code = normalize_emotion_code(emotion_code)
                    
                    # Skip invalid rows
                    if not raw_review or not emotion_code:
                        continue
                    
                    # Apply preprocessing if requested
                    preprocessed_heavy = ""
                    preprocessed_light = ""
                    
                    if self.apply_preprocessing:
                        try:
                            preprocessed_heavy = preprocess_review(
                                raw_review,
                                **PREPROCESSING_HEAVY_CONFIG
                            )
                            preprocessed_light = preprocess_review(
                                raw_review,
                                **PREPROCESSING_LIGHT_CONFIG
                            )
                        except Exception as e:
                            print(f"Warning: Preprocessing failed for row {row_num}: {e}")
                    
                    # Create review object
                    review = Review(
                        review_id=review_id,
                        raw_review=raw_review,
                        emotion_code=emotion_code,
                        evaluator_notes=evaluator_notes,
                        preprocessed_review_heavy=preprocessed_heavy,
                        preprocessed_review_light=preprocessed_light,
                    )
                    
                    dataset.reviews.append(review)
                
                except Exception as e:
                    print(f"Warning: Error processing row {row_num}: {e}")
                    continue
        
        # Store metadata
        dataset.metadata = {
            "source_file": str(filepath_obj),
            "total_reviews": len(dataset.reviews),
            "validation_info": validation_info,
            "class_distribution": dataset.get_class_distribution(),
        }
        
        return dataset, validation_info
    
    def load_and_report(self, filepath: str) -> Dataset:
        """
        Load dataset and print detailed report.
        
        Args:
            filepath: Path to CSV file
        
        Returns:
            Dataset object
        """
        dataset, validation_info = self.load(filepath)
        
        print("\n" + "=" * 80)
        print("DATASET LOADED")
        print("=" * 80)
        print(f"\nFile: {filepath}")
        print(f"Reviews Loaded: {len(dataset.reviews)}")
        
        distribution = dataset.get_class_distribution()
        if distribution:
            print(f"\nClass Distribution:")
            for label in sorted(distribution.keys()):
                count = distribution[label]
                pct = (count / len(dataset.reviews) * 100) if len(dataset.reviews) > 0 else 0
                print(f"  {label:12} {count:5} ({pct:5.1f}%)")
        
        if self.validator:
            print_dataset_summary(self.validator.summary)
        
        print("\n" + "=" * 80)
        
        return dataset


# ==============================================================================
# UTILITY FUNCTIONS
# ==============================================================================

def load_dataset(filepath: str, validate: bool = True) -> Dataset:
    """
    Convenience function to load a dataset.
    
    Args:
        filepath: Path to CSV file
        validate: If True, validate before loading (default: True)
    
    Returns:
        Dataset object
    
    Raises:
        ValueError: If validation fails
        FileNotFoundError: If file doesn't exist
    """
    loader = DatasetLoader(validate=validate, apply_preprocessing=True)
    dataset, _ = loader.load(filepath)
    return dataset


def validate_and_report(filepath: str):
    """
    Validate a dataset file and print detailed report.
    
    Args:
        filepath: Path to CSV file
    """
    validator = DatasetValidator()
    result = validator.validate_file(filepath)
    print_validation_result(result)
    print_dataset_summary(validator.summary)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
        try:
            loader = DatasetLoader(validate=True)
            dataset = loader.load_and_report(filepath)
            print(f"\nSuccessfully loaded {len(dataset)} reviews")
        except Exception as e:
            print(f"Error: {e}")
    else:
        print("Usage: python dataset.py <path_to_csv>")
