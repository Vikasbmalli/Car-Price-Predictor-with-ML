const form = document.getElementById("predict-form");

const modelSelect = document.getElementById("name");
const companySelect = document.getElementById("company");
const yearSelect = document.getElementById("year");
const fuelSelect = document.getElementById("fuel_type");
const kmsInput = document.getElementById("kms_driven");

const errorBox = document.getElementById("form-error");
const successBox = document.getElementById("form-success");
const predictButton = document.getElementById("predict-button");

const resultEmpty = document.getElementById("result-empty");
const resultFilled = document.getElementById("result-filled");
const resultProgress = document.getElementById("result-progress");
const progressBar = document.getElementById("prediction-progress-bar");
const progressFill = document.getElementById("prediction-progress-fill");
const progressValue = document.getElementById("prediction-progress-value");
const progressStatus = document.getElementById("progress-status");
const historyList = document.getElementById("prediction-history");
const historyCount = document.getElementById("history-count");
const historyMessage = document.getElementById("history-message");
const clearHistoryButton = document.getElementById("clear-history-button");

const HISTORY_STORAGE_KEY = "autovaluePredictionHistory";
const MAX_HISTORY_RECORDS = 20;
let predictionHistory = [];
let progressTimer;

function updateProgress(value, status) {
    progressFill.style.width = `${value}%`;
    progressValue.textContent = `${value}%`;
    progressBar.setAttribute("aria-valuenow", String(value));
    progressBar.setAttribute("aria-valuetext", `${value}%`);
    progressStatus.textContent = status;
}

function startPredictionProgress() {
    let progress = 0;
    updateProgress(progress, "Preparing vehicle details");
    resultEmpty.hidden = true;
    resultFilled.hidden = true;
    resultProgress.hidden = false;

    progressTimer = window.setInterval(() => {
        if (progress >= 90) {
            window.clearInterval(progressTimer);
            return;
        }

        progress = Math.min(progress + 10, 90);
        updateProgress(progress, "Analyzing vehicle details");
    }, 120);
}

async function completePredictionProgress() {
    window.clearInterval(progressTimer);
    updateProgress(100, "Analysis complete");
    await new Promise(resolve => window.setTimeout(resolve, 350));
    resultProgress.hidden = true;
}

function renderHistory() {
    historyList.replaceChildren();
    historyCount.textContent = String(predictionHistory.length);
    clearHistoryButton.hidden = predictionHistory.length === 0;

    if (predictionHistory.length === 0) {
        historyMessage.hidden = false;
        historyMessage.textContent = "Your estimates will appear here.";
        return;
    }

    historyMessage.hidden = true;
    predictionHistory.forEach(record => {
        const item = document.createElement("article");
        item.className = "history-record";

        const heading = document.createElement("div");
        heading.className = "history-record-heading";

        const vehicle = document.createElement("strong");
        vehicle.textContent =
            `${record.company} ${record.name} (${record.year})`;

        const price = document.createElement("strong");
        price.textContent = formatPrice(record.predictedPrice);

        const details = document.createElement("p");
        details.textContent =
            `${Number(record.kmsDriven).toLocaleString("en-IN")} km · ` +
            `${record.fuelType} · ${new Date(record.createdAt).toLocaleString()}`;

        heading.append(vehicle, price);
        item.append(heading, details);
        historyList.appendChild(item);
    });
}

function loadHistory() {
    try {
        const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (savedHistory === null) {
            renderHistory();
            return;
        }

        const parsedHistory = JSON.parse(savedHistory);
        if (!Array.isArray(parsedHistory)) {
            throw new Error("Saved prediction history is not a list.");
        }

        predictionHistory = parsedHistory.slice(0, MAX_HISTORY_RECORDS);
        renderHistory();
    } catch (error) {
        console.error("Unable to load saved prediction history.", error);
        historyMessage.hidden = false;
        historyMessage.textContent =
            "Saved records could not be loaded from this browser.";
    }
}

function savePrediction(record) {
    predictionHistory.unshift(record);
    predictionHistory = predictionHistory.slice(0, MAX_HISTORY_RECORDS);
    renderHistory();

    try {
        localStorage.setItem(
            HISTORY_STORAGE_KEY,
            JSON.stringify(predictionHistory)
        );
        historyMessage.hidden = true;
    } catch (error) {
        console.error("Unable to save prediction history.", error);
        historyMessage.hidden = false;
        historyMessage.textContent =
            "This estimate was generated, but could not be saved in this browser.";
    }
}

function formatPrice(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function fillSelect(select, values, placeholder) {
    select.innerHTML = "";

    const firstOption = document.createElement("option");
    firstOption.value = "";
    firstOption.textContent = placeholder;
    select.appendChild(firstOption);

    values.forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

function formatMetricPrice(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function renderCompanyChart(entries) {
    const colors = [
        "#b5f477",
        "#70c7a2",
        "#6d9ee8",
        "#bd8bea",
        "#f2b76d",
        "#718096"
    ];
    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    let cumulative = 0;
    const segments = entries.map((entry, index) => {
        const start = cumulative;
        cumulative += total ? entry.value / total * 100 : 0;
        return `${colors[index % colors.length]} ${start}% ${cumulative}%`;
    });
    const pie = document.getElementById("company-pie");
    pie.style.background = `conic-gradient(${segments.join(", ")})`;

    const legend = document.getElementById("company-legend");
    legend.replaceChildren();
    entries.forEach((entry, index) => {
        const item = document.createElement("div");
        item.className = "legend-item";

        const swatch = document.createElement("span");
        swatch.className = "legend-swatch";
        swatch.style.backgroundColor = colors[index % colors.length];

        const label = document.createElement("span");
        label.textContent = entry.label;

        const value = document.createElement("span");
        value.className = "legend-value";
        const share = total ? entry.value / total * 100 : 0;
        value.textContent = `${share.toFixed(1)}%`;

        item.append(swatch, label, value);
        legend.appendChild(item);
    });
}

function renderPriceChart(entries) {
    const container = document.getElementById("price-bars");
    const maximum = Math.max(...entries.map(entry => entry.value), 1);
    container.replaceChildren();

    entries.forEach(entry => {
        const row = document.createElement("div");
        row.className = "bar-row";

        const label = document.createElement("span");
        label.className = "bar-label";
        label.textContent = entry.label;

        const track = document.createElement("div");
        track.className = "bar-track";
        const fill = document.createElement("div");
        fill.className = "bar-fill";
        fill.style.width = `${entry.value / maximum * 100}%`;
        track.appendChild(fill);

        const count = document.createElement("span");
        count.className = "bar-count";
        count.textContent = entry.value.toLocaleString("en-IN");

        row.append(label, track, count);
        container.appendChild(row);
    });
}

function renderTrainingSettings(settings) {
    const names = {
        split_strategy: "Holdout split",
        test_size: "Test fraction",
        random_state: "Random seed",
        n_estimators: "Number of trees",
        min_samples_leaf: "Minimum samples per leaf",
        max_features: "Features considered per split",
        target_transform: "Target transformation",
        features: "Model input features",
        categorical_features: "One-hot encoded features",
        numeric_features: "Numeric features",
        unknown_category_handling: "Unseen category handling",
        data_validation: "Accepted data ranges",
        baseline_improvement_score_formula: "0-100 score formula"
    };
    const list = document.getElementById("training-settings");
    list.replaceChildren();
    Object.entries(names).forEach(([key, label]) => {
        const term = document.createElement("dt");
        term.textContent = label;
        const value = document.createElement("dd");
        const setting = settings[key];
        value.textContent = Array.isArray(setting)
            ? setting.join(", ")
            : key === "test_size"
                ? `${(Number(setting) * 100).toFixed(0)}%`
                : setting && typeof setting === "object"
                    ? Object.entries(setting)
                        .map(([range, bounds]) =>
                            `${range}: ${bounds[0]} to ${bounds[1]}`
                        )
                        .join("; ")
                    : String(setting);
        list.append(term, value);
    });
}

async function loadAnalytics() {
    const errorBox = document.getElementById("analysis-error");

    try {
        const response = await fetch("/api/analytics");
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Unable to load model analysis.");
        }

        const report = data.report;
        const metrics = report.metrics;
        document.getElementById("analysis-rows").textContent =
            report.dataset.clean_rows.toLocaleString("en-IN");
        document.getElementById("analysis-score").textContent =
            `${metrics.baseline_improvement_score.toFixed(1)}/100`;
        document.getElementById("analysis-score-bar").style.width =
            `${metrics.baseline_improvement_score}%`;
        document.getElementById("analysis-score-bar").parentElement
            .setAttribute(
                "aria-valuenow",
                metrics.baseline_improvement_score.toFixed(1)
            );
        document.getElementById("analysis-mae").textContent =
            formatMetricPrice(metrics.mae);
        document.getElementById("analysis-mape").textContent =
            `${metrics.median_absolute_percentage_error.toFixed(1)}%`;
        document.getElementById("analysis-summary").textContent =
            `${report.model} · evaluated on ${metrics.test_rows} held-out listings · ` +
            `R-squared ${metrics.r2.toFixed(3)}`;

        renderCompanyChart(data.charts.companies);
        renderPriceChart(data.charts.prices);
        renderTrainingSettings(report.settings);
        document.getElementById("analysis-content").hidden = false;
    } catch (error) {
        errorBox.textContent = error.message ||
            "Could not load the saved evaluation report.";
        errorBox.hidden = false;
        document.getElementById("analysis-summary").textContent =
            "Model analysis is currently unavailable.";
    }
}

async function loadMetadata() {
    predictButton.disabled = true;
    predictButton.textContent = "Loading dataset...";

    try {
        const response = await fetch("/api/metadata");

        if (!response.ok) {
            throw new Error("Unable to load vehicle options.");
        }

        const data = await response.json();

        fillSelect(
            modelSelect,
            data.models || [],
            "Select car model"
        );

        fillSelect(
            companySelect,
            data.brands || [],
            "Select manufacturer"
        );

        fillSelect(
            yearSelect,
            (data.years || []).map(String),
            "Select manufacturing year"
        );

        fillSelect(
            fuelSelect,
            data.fuel_types || [],
            "Select fuel type"
        );

        if (
            !data.models?.length ||
            !data.brands?.length ||
            !data.years?.length ||
            !data.fuel_types?.length
        ) {
            throw new Error("No valid vehicle options were returned.");
        }

        modelSelect.disabled = false;
        companySelect.disabled = false;
        yearSelect.disabled = false;
        fuelSelect.disabled = false;

        predictButton.disabled = false;
        predictButton.innerHTML =
            'Estimate Car Price <span>→</span>';

        successBox.textContent =
            `Dataset connected: ${data.clean_rows} valid priced cars available.`;
        successBox.hidden = false;

    } catch (error) {
        errorBox.textContent =
            error.message +
            " Make sure Flask is running and /api/metadata works.";
        errorBox.hidden = false;

        predictButton.disabled = true;
        predictButton.textContent = "Dataset unavailable";
    }
}

// Match the selected car name with a brand when possible.
modelSelect.addEventListener("change", () => {
    const model = modelSelect.value.toLowerCase();

    const match = [...companySelect.options].find(option => {
        return option.value &&
            model.startsWith(option.value.toLowerCase());
    });

    if (match) {
        companySelect.value = match.value;
    }
});

form.addEventListener("submit", async event => {
    event.preventDefault();

    errorBox.hidden = true;
    successBox.hidden = true;
    const hadResult = !resultFilled.hidden;
    const hadEmptyState = !resultEmpty.hidden;

    predictButton.disabled = true;
    predictButton.textContent = "Calculating price...";
    startPredictionProgress();

    const payload = {
        name: modelSelect.value,
        company: companySelect.value,
        year: Number(yearSelect.value),
        fuel_type: fuelSelect.value,
        kms_driven: Number(kmsInput.value)
    };

    try {
        const response = await fetch("/api/predict", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Price prediction failed."
            );
        }

        await completePredictionProgress();

        document.getElementById("result-price").textContent =
            data.formatted_price || formatPrice(data.predicted_price);

        document.getElementById("range-low").textContent =
            formatPrice(data.low_estimate);

        document.getElementById("range-high").textContent =
            formatPrice(data.high_estimate);

        document.getElementById("result-note").textContent =
            data.note ||
            "This is an estimate, not a guaranteed selling price.";

        resultEmpty.hidden = true;
        resultFilled.hidden = false;

        savePrediction({
            ...payload,
            predictedPrice: data.predicted_price,
            createdAt: new Date().toISOString()
        });

        successBox.textContent = "Price estimate generated successfully.";
        successBox.hidden = false;

        resultFilled.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });

    } catch (error) {
        window.clearInterval(progressTimer);
        resultProgress.hidden = true;
        resultFilled.hidden = !hadResult;
        resultEmpty.hidden = !hadEmptyState;
        errorBox.textContent =
            error.message || "Could not connect to the backend.";
        errorBox.hidden = false;

    } finally {
        predictButton.disabled = false;
        predictButton.innerHTML =
            'Estimate Car Price <span>→</span>';
    }
});

document.getElementById("reset-button").addEventListener("click", () => {
    form.reset();

    resultFilled.hidden = true;
    resultEmpty.hidden = false;
    resultProgress.hidden = true;

    errorBox.hidden = true;
    successBox.hidden = true;

    document.getElementById("predictor").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});

clearHistoryButton.addEventListener("click", () => {
    try {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
        predictionHistory = [];
        renderHistory();
    } catch (error) {
        console.error("Unable to clear saved prediction history.", error);
        historyMessage.hidden = false;
        historyMessage.textContent =
            "Saved records could not be cleared from this browser.";
    }
});

loadHistory();
loadMetadata();
loadAnalytics();