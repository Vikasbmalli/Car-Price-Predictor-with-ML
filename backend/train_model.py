from pathlib import Path
from datetime import datetime, timezone
import json
import re
import joblib
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.ensemble import ExtraTreesRegressor
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# --------------------------------------------------
# 1. Project paths
# --------------------------------------------------

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT.parent / "data" / "quikr_car.csv"
MODEL_PATH = ROOT / "models" / "car_price_model.joblib"
REPORT_PATH = ROOT / "reports" / "model_evaluation.json"

FEATURES = [
    "name",
    "company",
    "year",
    "car_age",
    "kms_driven",
    "fuel_type"
]

CURRENT_YEAR = 2026
MIN_YEAR = 1990
MAX_MILEAGE = 1_000_000
MIN_PRICE = 1
MAX_PRICE = 5_000_000
TEST_SIZE = 0.20
RANDOM_STATE = 42
N_ESTIMATORS = 500
MIN_SAMPLES_LEAF = 2
MAX_FEATURES = 0.9
CATEGORICAL_FEATURES = ["name", "company", "fuel_type"]
NUMERIC_FEATURES = ["year", "car_age", "kms_driven"]


# --------------------------------------------------
# 2. Convert dataset values to numbers
# --------------------------------------------------

def parse_number(value):
    if pd.isna(value):
        return np.nan

    # Remove thousands separators before parsing.
    text = str(value).replace(",", "").strip()

    match = re.search(r"\d+(?:\.\d+)?", text)

    if match:
        return float(match.group())

    return np.nan


# --------------------------------------------------
# 3. Clean the supplied dataset only
# --------------------------------------------------

def prepare_data(df):
    clean = df.copy()

    required = [
        "name", "company", "year",
        "Price", "kms_driven", "fuel_type"
    ]

    missing = [column for column in required
               if column not in clean.columns]

    if missing:
        raise ValueError(
            f"Dataset is missing columns: {missing}"
        )

    clean["name"] = clean["name"].astype("string").str.strip()
    clean["company"] = clean["company"].astype("string").str.strip()
    clean["fuel_type"] = (
        clean["fuel_type"].astype("string").str.strip().str.title()
    )

    clean["year"] = clean["year"].map(parse_number)
    clean["Price"] = clean["Price"].map(parse_number)
    clean["kms_driven"] = clean["kms_driven"].map(parse_number)

    # Remove rows with missing or invalid required values.
    clean = clean.dropna(
        subset=[
            "name", "company", "year",
            "Price", "kms_driven", "fuel_type"
        ]
    )

    # Retain plausible values represented by this dataset.
    clean = clean[
        clean["year"].between(MIN_YEAR, CURRENT_YEAR)
        & clean["kms_driven"].between(0, MAX_MILEAGE)
        & clean["Price"].between(MIN_PRICE, MAX_PRICE)
        & clean["name"].ne("")
        & clean["company"].ne("")
        & clean["fuel_type"].ne("")
    ].copy()

    clean["year"] = clean["year"].astype(int)
    clean["car_age"] = CURRENT_YEAR - clean["year"]

    # Keep feature names compatible with app.py.
    X = clean[FEATURES].copy()
    y = clean["Price"].astype(float).copy()

    return X, y, FEATURES, clean


# --------------------------------------------------
# 4. Build the machine learning pipeline
# --------------------------------------------------

def build_pipeline():
    preprocessing = ColumnTransformer(
        transformers=[
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore"),
                CATEGORICAL_FEATURES
            ),
            (
                "numeric",
                "passthrough",
                NUMERIC_FEATURES
            )
        ]
    )

    regressor = Pipeline(
        steps=[
            ("preprocessing", preprocessing),
            (
                "regressor",
                ExtraTreesRegressor(
                    n_estimators=N_ESTIMATORS,
                    min_samples_leaf=MIN_SAMPLES_LEAF,
                    max_features=MAX_FEATURES,
                    random_state=RANDOM_STATE,
                    n_jobs=-1
                )
            )
        ]
    )

    return TransformedTargetRegressor(
        regressor=regressor,
        func=np.log1p,
        inverse_func=np.expm1
    )


def evaluate_model(X, y):
    groups = pd.MultiIndex.from_frame(X).factorize(sort=False)[0]
    splitter = GroupShuffleSplit(
        n_splits=1,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE
    )
    train_indices, test_indices = next(
        splitter.split(X, y, groups=groups)
    )
    X_train, X_test = X.iloc[train_indices], X.iloc[test_indices]
    y_train, y_test = y.iloc[train_indices], y.iloc[test_indices]

    evaluation_model = build_pipeline()
    evaluation_model.fit(X_train, y_train)

    predictions = np.maximum(0, evaluation_model.predict(X_test))
    mae = mean_absolute_error(y_test, predictions)
    baseline_mae = mean_absolute_error(
        y_test,
        np.full(len(y_test), y_train.median())
    )
    score = max(
        0.0,
        min(100.0, (baseline_mae - mae) / baseline_mae * 100)
    )

    return {
        "train_rows": int(len(train_indices)),
        "test_rows": int(len(test_indices)),
        "mae": float(mae),
        "rmse": float(np.sqrt(mean_squared_error(y_test, predictions))),
        "r2": float(r2_score(y_test, predictions)),
        "median_absolute_percentage_error": float(
            np.median(np.abs(y_test - predictions) / y_test) * 100
        ),
        "baseline_mae": float(baseline_mae),
        "baseline_improvement_score": float(score)
    }


def save_evaluation_report(metrics, original_rows, clean_rows):
    report = {
        "model": "ExtraTreesRegressor with log-transformed target",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "source": str(DATA_PATH.name),
            "original_rows": int(original_rows),
            "clean_rows": int(clean_rows),
            "excluded_rows": int(original_rows - clean_rows)
        },
        "settings": {
            "test_size": TEST_SIZE,
            "random_state": RANDOM_STATE,
            "split_strategy": "GroupShuffleSplit by identical vehicle features",
            "n_estimators": N_ESTIMATORS,
            "min_samples_leaf": MIN_SAMPLES_LEAF,
            "max_features": MAX_FEATURES,
            "target_transform": "log1p; predictions are inverse-transformed with expm1",
            "features": FEATURES,
            "categorical_features": CATEGORICAL_FEATURES,
            "numeric_features": NUMERIC_FEATURES,
            "unknown_category_handling": "ignore unseen one-hot encoded categories",
            "data_validation": {
                "model_year": [MIN_YEAR, CURRENT_YEAR],
                "kilometres_driven": [0, MAX_MILEAGE],
                "price_inr": [MIN_PRICE, MAX_PRICE]
            },
            "baseline_improvement_score_formula": (
                "clamp(100 * (baseline_mae - model_mae) / baseline_mae, 0, 100)"
            )
        },
        "metrics": metrics,
        "score_explanation": (
            "Baseline improvement score is the percentage reduction in held-out "
            "MAE relative to predicting the training-set median price. It is not "
            "the percentage of predictions that are correct."
        )
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(
        json.dumps(report, indent=2),
        encoding="utf-8"
    )
    return report


# --------------------------------------------------
# 5. Evaluate, retrain and save the model
# --------------------------------------------------

def train_and_save():
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Dataset not found: {DATA_PATH}"
        )

    df = pd.read_csv(DATA_PATH)
    X, y, features, clean = prepare_data(df)

    if len(clean) < 20:
        raise ValueError(
            "Not enough valid dataset rows to train."
        )

    print("\nDataset:", DATA_PATH)
    print("Original rows:", len(df))
    print("Clean training rows:", len(clean))
    print("Rows excluded:", len(df) - len(clean))

    metrics = evaluate_model(X, y)
    save_evaluation_report(metrics, len(df), len(clean))

    print("\n--- Test Results ---")
    print(f"MAE:  INR {metrics['mae']:,.0f}")
    print(f"RMSE: INR {metrics['rmse']:,.0f}")
    print(f"R-squared: {metrics['r2']:.3f}")
    print(
        "Median absolute percentage error: "
        f"{metrics['median_absolute_percentage_error']:.1f}%"
    )
    print(f"Median-price baseline MAE: INR {metrics['baseline_mae']:,.0f}")
    print(
        "Baseline improvement score: "
        f"{metrics['baseline_improvement_score']:.1f}/100"
    )

    # Retrain the final model on all cleaned dataset rows.
    final_model = build_pipeline()
    final_model.fit(X, y)

    MODEL_PATH.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    joblib.dump(
        {
            "model": final_model,
            "features": features
        },
        MODEL_PATH
    )

    print("\nFinal model saved to:")
    print(MODEL_PATH)
    print("Retraining completed successfully.")


if __name__ == "__main__":
    train_and_save()
