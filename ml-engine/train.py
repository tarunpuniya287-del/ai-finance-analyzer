import pandas as pd
import numpy as np
import pickle
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import warnings
warnings.filterwarnings('ignore')

print("📦 Loading dataset...")
df = pd.read_csv('final_training_data.csv')
print(f"Dataset shape: {df.shape}")

# Feature Engineering
df['income_bracket'] = pd.cut(df['monthly_income'],
    bins=[0, 25000, 50000, 100000, 200000, float('inf')],
    labels=[1, 2, 3, 4, 5]).astype(int)

df['is_festival_month'] = df['month'].isin([10, 11, 12]).astype(int)
df['is_tax_saving_month'] = df['month'].isin([1, 2, 3]).astype(int)
df['limit_ratio'] = df['safe_spending_limit'] / df['monthly_income']

# One-hot encode category
df = pd.get_dummies(df, columns=['category'], prefix='category')

feature_cols = ['month', 'monthly_income', 'prev_month_expense',
                'savings_rate', 'expense_ratio', 'income_bracket',
                'is_festival_month', 'is_tax_saving_month'] + \
               [c for c in df.columns if c.startswith('category_')]

X = df[feature_cols]
y = df['safe_spending_limit']  # TARGET: safe limit

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
print(f"\n🔧 Training on {len(X_train)} samples")

# Gradient Boosting
print("\n🚀 Training Gradient Boosting...")
gb = GradientBoostingRegressor(n_estimators=200, learning_rate=0.1, max_depth=6, random_state=42)
gb.fit(X_train, y_train)
gb_pred = gb.predict(X_test)
gb_mae = mean_absolute_error(y_test, gb_pred)
gb_r2 = r2_score(y_test, gb_pred)
print(f"   MAE: ₹{gb_mae:.2f} | R²: {gb_r2:.4f}")

# Random Forest
print("\n🌲 Training Random Forest...")
rf = RandomForestRegressor(n_estimators=200, max_depth=15, random_state=42, n_jobs=-1)
rf.fit(X_train, y_train)
rf_pred = rf.predict(X_test)
rf_mae = mean_absolute_error(y_test, rf_pred)
rf_r2 = r2_score(y_test, rf_pred)
print(f"   MAE: ₹{rf_mae:.2f} | R²: {rf_r2:.4f}")

best_model = gb if gb_r2 >= rf_r2 else rf
best_name = "Gradient Boosting" if gb_r2 >= rf_r2 else "Random Forest"
best_r2 = max(gb_r2, rf_r2)
print(f"\n✅ Best Model: {best_name} (R²: {best_r2:.4f})")

pickle.dump(best_model, open('finance_model.pkl', 'wb'))
pickle.dump(feature_cols, open('model_columns.pkl', 'wb'))

print("💾 Model saved!")
print("\n📊 Top Features:")
importances = pd.Series(best_model.feature_importances_, index=feature_cols)
print(importances.nlargest(8).to_string())
print("\n🎯 Training Complete!")
