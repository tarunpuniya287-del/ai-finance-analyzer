from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import pandas as pd
import numpy as np

app = Flask(__name__)
CORS(app)

# Load model and columns
def load_or_train_model():
    global model, model_columns
    try:
        model = pickle.load(open('finance_model.pkl', 'rb'))
        model_columns = pickle.load(open('model_columns.pkl', 'rb'))
        print("✅ Model loaded successfully!")
    except Exception as e:
        print(f"⚠️ Model load failed ({e}), retraining...")
        try:
            import subprocess
            subprocess.run(['python', 'train.py'], check=True)
            model = pickle.load(open('finance_model.pkl', 'rb'))
            model_columns = pickle.load(open('model_columns.pkl', 'rb'))
            print("✅ Model retrained and loaded!")
        except Exception as e2:
            print(f"❌ Retrain failed: {e2}")
            model = None
            model_columns = []

load_or_train_model()

def build_input(month, income, prev_expense, category):
    """Build input DataFrame matching training features"""
    # Derived features
    savings_rate = round((income - prev_expense) / income, 4) if income > 0 else 0
    expense_ratio = round(prev_expense / income, 4) if income > 0 else 0
    income_bracket = 1
    if income > 200000: income_bracket = 5
    elif income > 100000: income_bracket = 4
    elif income > 50000: income_bracket = 3
    elif income > 25000: income_bracket = 2

    row = {
        'month': month,
        'monthly_income': income,
        'prev_month_expense': prev_expense,
        'savings_rate': savings_rate,
        'expense_ratio': expense_ratio,
        'income_bracket': income_bracket,
        'is_festival_month': 1 if month in [10, 11, 12] else 0,
        'is_tax_saving_month': 1 if month in [1, 2, 3] else 0,
        'is_travel_season': 1 if month in [5, 6, 12, 1] else 0,
    }

    # Category one-hot
    for col in model_columns:
        if col.startswith('category_'):
            row[col] = 1 if col == f'category_{category}' else 0

    df = pd.DataFrame([row])

    # Ensure all columns present
    for col in model_columns:
        if col not in df.columns:
            df[col] = 0

    return df[model_columns]


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "online",
        "model_loaded": model is not None,
        "features": len(model_columns)
    })


@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({"status": "error", "message": "Model not loaded. Run train.py first."}), 503

    try:
        data = request.get_json()
        month = int(data.get('month', 1))
        income = float(data.get('monthly_income', 50000))
        prev_expense = float(data.get('prev_month_expense', 0))
        category = data.get('category', 'Food')

        input_df = build_input(month, income, prev_expense, category)
        safe_limit = float(model.predict(input_df)[0])
        safe_limit = max(income * 0.40, min(safe_limit, income * 0.85))  # Clamp between 40-85%
        safe_limit = round(safe_limit, 2)

        remaining = round(safe_limit - prev_expense, 2)
        used_pct = round((prev_expense / safe_limit * 100), 1) if safe_limit > 0 else 0

        if used_pct >= 100:
            status = "Over Budget"
        elif used_pct >= 80:
            status = "Warning"
        elif used_pct >= 60:
            status = "Moderate"
        else:
            status = "Excellent"

        return jsonify({
            "status": "success",
            "safe_spending_limit": safe_limit,
            "remaining_budget": max(0, remaining),
            "used_percentage": used_pct,
            "budget_status": status,
            "income": income,
            "current_expense": prev_expense
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route('/predict-all', methods=['POST'])
def predict_all():
    """Predict expenses for all categories at once"""
    if model is None:
        return jsonify({"status": "error", "message": "Model not loaded"}), 503

    try:
        data = request.get_json()
        month = int(data.get('month', 1))
        income = float(data.get('monthly_income', 50000))
        prev_expense = float(data.get('prev_month_expense', 20000))

        categories = ['Groceries', 'Food', 'Rent', 'Shopping',
                      'Travel', 'Medical', 'Entertainment', 'Investment', 'Bills']

        results = {}
        for cat in categories:
            input_df = build_input(month, income, prev_expense, cat)
            pred = float(model.predict(input_df)[0])
            results[cat] = round(max(0, pred), 2)

        total_predicted = sum(results.values())
        return jsonify({
            "status": "success",
            "predictions": results,
            "total_predicted": round(total_predicted, 2),
            "monthly_income": income,
            "estimated_savings": round(income - total_predicted, 2)
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
