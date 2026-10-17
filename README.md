# AutoValue — Used Car Price Predictor

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.x-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-Extra_Trees-F7931E?logo=scikitlearn&logoColor=white)](https://scikit-learn.org/)

AutoValue is a Flask web application that estimates used-car resale prices in
Indian rupees (INR). Enter a vehicle's model, manufacturer, manufacturing
year, fuel type, and kilometres driven to get a model-generated estimate and
an indicative price range.

> [!IMPORTANT]
> Estimates are informational only—not appraisals, offers, or guaranteed
> selling prices. The supplied dataset is small and noisy, and does not include
> important factors such as vehicle condition, location, ownership history, or
> current local demand.

## Features

- **Price estimates:** Predict a resale price and an indicative range of
  ±10%.
- **Analysis progress:** See a 0–100% progress indicator while a prediction
  runs.
- **Previous records:** View and clear up to 20 recent estimates saved in the
  current browser.
- **Dataset insights:** Explore cleaned listing counts, evaluation metrics,
  manufacturer shares, and price bands.
- **Transparent evaluation:** Review holdout metrics, model settings, and
  download the evaluation report.
- **Responsive interface:** Use the predictor on desktop and mobile screens.

## Quick start

### Requirements

- Python 3.10 or newer
- pip
- The supplied dataset at `data/quikr_car.csv`

### Windows (PowerShell)

Run these commands from the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python backend\app.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000). The app automatically
trains and saves the model the first time it starts if the model bundle is
missing.

To train or retrain the model and evaluation report explicitly:

```powershell
python backend\train_model.py
```

### macOS / Linux

Run these commands from the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python backend/app.py
```

To train or retrain explicitly:

```bash
python backend/train_model.py
```

## Using the app

1. Choose a car model, manufacturer, manufacturing year, and fuel type.
2. Enter kilometres driven and submit the form.
3. Follow the analysis progress in the result card, then review the estimate
   and indicative range.
4. Expand **View previous records** to review recent estimates or clear the
   saved records.
5. Visit **Analysis** to explore dataset statistics and the model evaluation.

Prediction history is stored in the browser's local storage. It is not sent to
the Flask backend, and it is available only in the browser profile where it
was created.

## How it works

### Data preparation

The trainer reads `data/quikr_car.csv`, normalizes numeric values (including
comma-separated prices), and removes rows with missing or out-of-range
required values. The current filters accept:

| Field | Accepted range |
| --- | --- |
| Manufacturing year | 1990–2026 |
| Kilometres driven | 0–1,000,000 km |
| Listing price | INR 1–5,000,000 |

Rows such as listings with an unparseable price are excluded. The model uses
car model, manufacturer, year, car age, kilometres driven, and fuel type.

### Model and evaluation

The prediction pipeline uses an `ExtraTreesRegressor` with 500 trees,
`min_samples_leaf=2`, and `max_features=0.9`. Car model, manufacturer, and fuel
type are one-hot encoded; numeric features pass through unchanged. The target
price is trained on a `log1p` scale and predictions are converted back with
`expm1`. Unseen categories are ignored by the encoder.

Evaluation uses a deterministic 80/20 `GroupShuffleSplit` with random seed
42. Identical vehicle-feature rows are kept in the same group to reduce
duplicate-listing leakage between training and test data. The final model is
then refit using all cleaned rows.

The evaluation report includes MAE, RMSE, R-squared, median absolute
percentage error, and a baseline improvement score. That 0–100 score measures
the reduction in holdout MAE compared with always predicting the training-set
median:

```text
clamp(100 × (baseline MAE − model MAE) / baseline MAE, 0, 100)
```

**The 0–100 score is not the percentage of predictions that are correct.**
The estimate's ±10% range is also a presentation heuristic, not a
statistically calibrated confidence interval.

The checked-in evaluation report reflects its last training run. For that
run, 815 of 892 rows were retained; holdout MAE was approximately INR 134,183,
RMSE INR 251,368, R-squared 0.417, and median absolute percentage error
24.8%. These figures may change after retraining or changing the dataset.

## Dataset and generated files

The source dataset is `data/quikr_car.csv`. After changing it, rerun the
training command to refresh the model and report.

| Path | Purpose |
| --- | --- |
| `backend/models/car_price_model.joblib` | Generated model bundle; created if missing and excluded from Git |
| `backend/reports/model_evaluation.json` | Saved model settings and holdout evaluation |

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Render the predictor page |
| `GET` | `/api/health` | Check that the service is running |
| `GET` | `/api/metadata` | Retrieve valid car models, brands, years, and fuel types |
| `GET` | `/api/analytics` | Retrieve evaluation metrics and chart data |
| `GET` | `/api/analytics/report` | Download the JSON evaluation report |
| `POST` | `/api/predict` | Predict a price for the supplied vehicle details |

### Example prediction request

```bash
curl -X POST http://127.0.0.1:5000/api/predict \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hyundai Santro Xing XO eRLX Euro III",
    "company": "Hyundai",
    "year": 2007,
    "fuel_type": "Petrol",
    "kms_driven": 45000
  }'
```

The JSON response contains `predicted_price`, `formatted_price`,
`low_estimate`, `high_estimate`, and an explanatory `note`. Invalid input
returns an error response.

## Project structure

```text
.
├── backend/
│   ├── app.py
│   ├── train_model.py
│   ├── requirements.txt
│   ├── models/                  # Generated model bundle
│   └── reports/
│       └── model_evaluation.json
├── data/
│   └── quikr_car.csv
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── .gitignore
└── README.md
```

## Troubleshooting

- **Dataset not found:** Run commands from the project root and confirm
  `data/quikr_car.csv` exists.
- **Vehicle options do not load:** Confirm the Flask server is running, then
  open `/api/health` and `/api/metadata` in your browser.
- **Startup or prediction fails:** Check the terminal output for the backend
  error. If dependencies changed, reinstall the requirements. If the dataset
  changed, retrain the model.
- **History is missing:** Previous records belong to the browser profile and
  device that created them. Clearing browser storage removes them.
