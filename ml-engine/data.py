import pandas as pd
import numpy as np

np.random.seed(42)
data_size = 50000

salary_profiles = [
    (15000, 25000),
    (25000, 50000),
    (50000, 100000),
    (100000, 200000),
    (200000, 500000),
]

category_profiles = {
    'Groceries':     {'min': 0.08, 'max': 0.18},
    'Food':          {'min': 0.06, 'max': 0.20},
    'Rent':          {'min': 0.20, 'max': 0.40},
    'Shopping':      {'min': 0.04, 'max': 0.15},
    'Travel':        {'min': 0.03, 'max': 0.20},
    'Medical':       {'min': 0.02, 'max': 0.10},
    'Entertainment': {'min': 0.02, 'max': 0.10},
    'Investment':    {'min': 0.05, 'max': 0.30},
    'Bills':         {'min': 0.05, 'max': 0.12},
}

categories = list(category_profiles.keys())

rows = []
for _ in range(data_size):
    bracket = salary_profiles[np.random.randint(len(salary_profiles))]
    income = np.random.randint(bracket[0], bracket[1])
    month = np.random.randint(1, 13)
    category = np.random.choice(categories)
    profile = category_profiles[category]

    # Actual expense ratio
    actual_ratio = np.random.uniform(profile['min'], profile['max'])
    if month in [10, 11, 12]: actual_ratio *= np.random.uniform(1.1, 1.4)
    if income > 100000: actual_ratio *= np.random.uniform(0.7, 0.9)
    elif income < 25000: actual_ratio *= np.random.uniform(1.0, 1.15)

    actual_expense = round(income * actual_ratio, 2)
    prev_expense = round(actual_expense * np.random.uniform(0.8, 1.2), 2)

    savings_rate = round((income - prev_expense) / income, 4)
    expense_ratio = round(prev_expense / income, 4)

    # TARGET: safe_spending_limit
    # Logic: Based on income bracket and spending pattern, what's the safe max expense?
    # Higher income = can afford higher absolute spend but should save more %
    # Good savers (savings_rate > 0.3) = tighter limit
    # Bad savers (savings_rate < 0.1) = stricter limit to correct behavior
    
    if savings_rate >= 0.30:
        limit_factor = np.random.uniform(0.65, 0.72)  # Already good savers
    elif savings_rate >= 0.20:
        limit_factor = np.random.uniform(0.60, 0.68)  # Average savers
    elif savings_rate >= 0.10:
        limit_factor = np.random.uniform(0.55, 0.63)  # Below average
    else:
        limit_factor = np.random.uniform(0.50, 0.58)  # Poor savers - strict limit

    # Festival months - slightly relaxed limit
    if month in [10, 11, 12]:
        limit_factor += np.random.uniform(0.02, 0.05)

    safe_limit = round(income * limit_factor, 2)

    rows.append({
        'month': month,
        'category': category,
        'monthly_income': income,
        'prev_month_expense': prev_expense,
        'savings_rate': savings_rate,
        'expense_ratio': expense_ratio,
        'safe_spending_limit': safe_limit  # NEW TARGET
    })

df = pd.DataFrame(rows)
df.to_csv('final_training_data.csv', index=False)
print(f"✅ Dataset ready: {len(df)} rows")
print(f"Avg safe limit ratio: {(df['safe_spending_limit'] / df['monthly_income']).mean():.2%}")
print(df[['monthly_income', 'prev_month_expense', 'savings_rate', 'safe_spending_limit']].describe())
