import json
from flask import Flask, render_template, request, jsonify, send_file
from pathlib import Path
import pandas as pd
import joblib

from train_model import (
    prepare_data,
    DATA_PATH,
    MODEL_PATH,
    REPORT_PATH,
    build_pipeline,
    evaluate_model,
    save_evaluation_report
)

ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT.parent / "frontend"

app = Flask(
    __name__,
    template_folder=str(FRONTEND_DIR),
    static_folder=str(FRONTEND_DIR),
    static_url_path="/static"
)


def train_model():
    df = pd.read_csv(DATA_PATH)
    X, y, features, clean = prepare_data(df)
    metrics = evaluate_model(X, y)
    save_evaluation_report(metrics, len(df), len(clean))

    model = build_pipeline()
    model.fit(X, y)

    MODEL_PATH.parent.mkdir(
        parents=True, exist_ok=True
    )

    joblib.dump(
        {"model": model, "features": features},
        MODEL_PATH
    )


def get_model():
    if not MODEL_PATH.exists():
        train_model()

    return joblib.load(MODEL_PATH)


@app.route("/")
def home():
    return render_template("index.html")

@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "message": "Car Price Predictor API is running"
    })


@app.route("/api/metadata")
def metadata():
    df = pd.read_csv(DATA_PATH)
    X, y, features, clean = prepare_data(df)

    return jsonify({
        "brands": sorted(
            clean["company"].astype(str).unique().tolist()
        ),
        "fuel_types": sorted(
            clean["fuel_type"].astype(str).unique().tolist()
        ),
        "models": sorted(
            clean["name"].astype(str).unique().tolist()
        ),
        "years": sorted(
            clean["year"].astype(int).unique().tolist(),
            reverse=True
        ),
        "dataset_rows": int(len(df)),
        "clean_rows": int(len(clean))
    })


@app.route("/api/analytics")
def analytics():
    df = pd.read_csv(DATA_PATH)
    _, _, _, clean = prepare_data(df)

    if not REPORT_PATH.exists():
        train_model()

    with REPORT_PATH.open(encoding="utf-8") as report_file:
        report = json.load(report_file)

    company_counts = clean["company"].value_counts()
    top_companies = company_counts.head(5)
    other_companies = int(company_counts.iloc[5:].sum())
    company_distribution = [
        {"label": str(company), "value": int(count)}
        for company, count in top_companies.items()
    ]
    if other_companies:
        company_distribution.append({
            "label": "Other",
            "value": other_companies
        })

    price_bins = [
        ("Under INR 1 lakh", 0, 100_000),
        ("INR 1-2.5 lakh", 100_000, 250_000),
        ("INR 2.5-5 lakh", 250_000, 500_000),
        ("INR 5-10 lakh", 500_000, 1_000_000),
        ("Over INR 10 lakh", 1_000_000, float("inf"))
    ]
    price_distribution = [
        {
            "label": label,
            "value": int(
                clean["Price"].between(
                    lower,
                    upper,
                    inclusive="left"
                ).sum()
            )
        }
        for label, lower, upper in price_bins
    ]

    return jsonify({
        "report": report,
        "charts": {
            "companies": company_distribution,
            "prices": price_distribution
        }
    })


@app.route("/api/analytics/report")
def download_analytics_report():
    if not REPORT_PATH.exists():
        train_model()
    return send_file(
        REPORT_PATH,
        mimetype="application/json",
        as_attachment=True,
        download_name="model_evaluation.json"
    )


@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json(force=True)

        name = str(data["name"]).strip()
        company = str(data["company"]).strip()
        fuel_type = str(data["fuel_type"]).strip().title()
        year = int(data["year"])
        kms_driven = float(data["kms_driven"])

        if not name or not company or not fuel_type:
            return jsonify({
                "error": "Complete all vehicle details."
            }), 400

        if not 1990 <= year <= 2026:
            return jsonify({
                "error": "Invalid manufacturing year."
            }), 400

        if not 0 <= kms_driven <= 1_000_000:
            return jsonify({
                "error": "Invalid kilometres driven."
            }), 400

        vehicle = pd.DataFrame([{
            "name": name,
            "company": company,
            "year": year,
            "car_age": 2026 - year,
            "kms_driven": kms_driven,
            "fuel_type": fuel_type
        }])

        bundle = get_model()
        model = bundle["model"]

        price = max(
            0,
            float(model.predict(vehicle)[0])
        )

        return jsonify({
            "predicted_price": round(price),
            "formatted_price": f"₹{price:,.0f}",
            "low_estimate": round(price * 0.90),
            "high_estimate": round(price * 1.10),
            "note": (
                "Estimated price based on the Quikr dataset. "
                "Actual resale prices may vary."
            )
        })

    except Exception:
        app.logger.exception("Prediction failed")
        return jsonify({
            "error": "Prediction failed. Check the input and model."
        }), 500


if __name__ == "__main__":
    if not MODEL_PATH.exists():
        train_model()

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
