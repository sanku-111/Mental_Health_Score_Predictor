// ===== Mental Health Score Predictor: frontend logic =====

// Address of the FastAPI prediction endpoint
const API_URL = "http://127.0.0.1:8000/predict";

// ASSUMPTION: the gauge scale. Your backend does not state the model's score range.
// 1-10 is assumed (the usual scale for this kind of dataset). Change these two
// numbers if your model uses a different range.
const SCORE_MIN = 1;
const SCORE_MAX = 10;

// Page elements
const form = document.getElementById("predict-form");
const submitBtn = document.getElementById("submit-btn");
const btnLabel = document.getElementById("btn-label");
const resetBtn = document.getElementById("reset-btn");
const messageBox = document.getElementById("message");
const resultBox = document.getElementById("result");
const scoreEl = document.getElementById("score");
const gaugeFill = document.getElementById("gauge-fill");
const countrySelect = document.getElementById("country");
const otherField = document.getElementById("other-country-field");
const otherInput = document.getElementById("other-country");

const INT_FIELDS = ["age", "daily_unlocks"];
const FLOAT_FIELDS = ["avg_daily_usage_hours", "study_hours", "physical_activity_hours", "sleep_hours_per_night"];
const TEXT_FIELDS = ["gender", "academic_level", "most_used_platform", "purpose_of_use"];

let isLoading = false;

document.getElementById("gauge-min").textContent = SCORE_MIN;
document.getElementById("gauge-max").textContent = SCORE_MAX;

// ---------- Sliders ----------

// Update the value bubble and the filled part of one slider
function updateSlider(slider) {
  const out = document.getElementById(slider.id + "-out");
  const unit = out.dataset.unit || "";
  out.textContent = slider.value + unit;
  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty("--pct", pct + "%");
}

const sliders = form.querySelectorAll('input[type="range"]');
sliders.forEach(function (slider) {
  updateSlider(slider);
  slider.addEventListener("input", function () { updateSlider(slider); });
});

// ---------- Small helpers ----------

function showMessage(text, type, details) {
  messageBox.className = "message " + type;
  messageBox.textContent = text;
  if (details && details.length) {
    const list = document.createElement("ul");
    details.forEach(function (d) {
      const li = document.createElement("li");
      li.textContent = d;
      list.appendChild(li);
    });
    messageBox.appendChild(list);
  }
  messageBox.hidden = false;
}

function clearMessage() {
  messageBox.hidden = true;
  messageBox.textContent = "";
}

function setLoading(state) {
  isLoading = state;
  submitBtn.disabled = state;
  submitBtn.classList.toggle("loading", state);
  btnLabel.textContent = state ? "Predicting..." : "Predict Mental Health Score";
}

// Show the extra text box only when "Other" is chosen as the country
countrySelect.addEventListener("change", function () {
  const isOther = countrySelect.value === "Other";
  otherField.hidden = !isOther;
  if (!isOther) otherInput.value = "";
});

// ---------- Validation (sliders always have a value, so only dropdowns and stress level need checking) ----------

function validateForm() {
  const problems = [];
  form.querySelectorAll(".invalid").forEach(function (el) { el.classList.remove("invalid"); });

  form.querySelectorAll("select[required]").forEach(function (el) {
    if (el.value === "") {
      el.classList.add("invalid");
      const label = form.querySelector('label[for="' + el.id + '"]').textContent;
      problems.push(label + " is required.");
    }
  });

  // Stress level: one of the four buttons must be chosen
  const stressGroup = document.getElementById("stress_level");
  if (!form.querySelector('input[name="stress_level"]:checked')) {
    stressGroup.classList.add("invalid");
    problems.push("Current stress level is required.");
  }
  return problems;
}

// ---------- Request body ----------

function buildPayload() {
  const payload = {};
  INT_FIELDS.forEach(function (name) { payload[name] = parseInt(form.elements[name].value, 10); });
  FLOAT_FIELDS.forEach(function (name) { payload[name] = parseFloat(form.elements[name].value); });
  TEXT_FIELDS.forEach(function (name) { payload[name] = form.elements[name].value; });
  payload.stress_level = form.querySelector('input[name="stress_level"]:checked').value;

  let country = countrySelect.value;
  if (country === "Other" && otherInput.value.trim() !== "") {
    country = otherInput.value.trim();
  }
  payload.country = country;
  return payload;
}

function formatValidationErrors(body) {
  if (body && Array.isArray(body.detail)) {
    return body.detail.map(function (err) {
      const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : "input";
      return field + ": " + err.msg;
    });
  }
  return [];
}

// ---------- Gauge ----------

// Fill the semicircle in proportion to where the score sits between SCORE_MIN and SCORE_MAX
function showScore(score) {
  const ratio = (score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN);
  const clamped = Math.min(1, Math.max(0, ratio));
  scoreEl.textContent = score.toFixed(2);
  resultBox.hidden = false;
  // Start empty, then fill on the next frame so the CSS transition plays
  gaugeFill.style.strokeDashoffset = 100;
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      gaugeFill.style.strokeDashoffset = 100 - clamped * 100;
    });
  });
}

// ---------- Submit ----------

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (isLoading) return;

  clearMessage();
  resultBox.hidden = true;

  const problems = validateForm();
  if (problems.length) {
    showMessage("Please fix the following before predicting:", "error", problems);
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload())
    });

    let body = null;
    try { body = await response.json(); } catch (e) { body = null; }

    if (response.status === 422) {
      showMessage("The server rejected some of the values:", "error", formatValidationErrors(body));
      return;
    }
    if (!response.ok) {
      showMessage("The server returned an error (HTTP " + response.status + "). Check the FastAPI terminal for details.", "error");
      return;
    }

    const score = body ? body.predicted_mental_health_score : undefined;
    if (typeof score !== "number" || !Number.isFinite(score)) {
      showMessage("The server sent an unexpected response format.", "error");
      return;
    }

    showScore(score);
    resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
    showMessage("Prediction complete.", "success");

  } catch (error) {
    showMessage("Unable to connect to the prediction server. Make sure FastAPI is running.", "error");
  } finally {
    setLoading(false);
  }
});

// ---------- Reset ----------

resetBtn.addEventListener("click", function () {
  form.reset();
  sliders.forEach(updateSlider); // put slider bubbles and fills back to defaults
  otherField.hidden = true;
  form.querySelectorAll(".invalid").forEach(function (el) { el.classList.remove("invalid"); });
  clearMessage();
  resultBox.hidden = true;
  scoreEl.textContent = "–";
  gaugeFill.style.strokeDashoffset = 100;
});
