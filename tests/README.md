# Tests

Three harnesses, 148 checks in total. All run against a live database; the
last two also need the API running. Together they cover the eight scenarios
in the project requirements.

| Harness | Level | Checks |
|---|---|---|
| `test_business_rules.sql` | database | 52 |
| `test_api.py` | HTTP API | 82 |
| `test_ui_contract.py` | API ↔ frontend contract | 14 |

Reload `database/schema.sql` + `database/seed.sql` before each harness: they
mutate data, and the assertions assume the seeded starting state.

## 1. `test_business_rules.sql`: database level (52 checks)

Proves the business rules hold in the database itself, independently of the
API: constraints reject bad rows, placing an order does not move stock, only
acceptance does, rejection never does, a cancellation cannot be stored
without a reason, and one vendor cannot touch another vendor's products.

```bash
psql "$DATABASE_URL" -f database/schema.sql      # fresh schema
psql "$DATABASE_URL" -f database/seed.sql        # demo data
psql "$DATABASE_URL" -f tests/test_business_rules.sql
```

Every line of output begins `PASS` or `FAIL`. It mutates data, so reload
`schema.sql` + `seed.sql` afterwards before demoing.

## 2. `test_api.py`: end-to-end API (82 checks)

Walks the whole workflow through HTTP: register, log in, add a product,
search, order, over-order, accept, reject, cancel with a reason, and every
cross-account authorisation case.

```bash
# fresh database first, so the assertions are deterministic
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seed.sql

cd backend && python -m uvicorn app.main:app --port 8000   # in one terminal
python tests/test_api.py                                   # in another
```

Exits non-zero if anything fails, and prints a `N passed, N failed` summary.
It needs only the standard library.

If the API is not on `http://127.0.0.1:8000`, edit `BASE` at the top of the
file.

## 3. `test_ui_contract.py`: API to frontend contract (14 checks)

Confirms that every field the React components read actually exists in the
live API responses, and that the values are in the shape the UI assumes:
`status` matches the CSS pill class names, `order_day` is `YYYY-MM-DD` as the
chart's date parser expects, and a cancellation reason is present for both
the vendor and the customer.

This catches the "page renders but every cell is blank" class of bug, which
a successful `npm run build` cannot detect.

```bash
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seed.sql
python tests/test_ui_contract.py
```

> On Windows use `127.0.0.1` rather than `localhost` for both the API and
> the database. `localhost` resolves to the IPv6 address `::1` first, and if
> the service only listens on IPv4 every connection stalls for about ten
> seconds before falling back.
