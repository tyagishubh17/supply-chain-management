#!/bin/bash
set -e
BASE=http://localhost:8000

echo "=== register fresh enterprise ==="
ENT_JSON=$(curl -s -X POST $BASE/auth/register/enterprise -H "Content-Type: application/json" \
  -d '{"name":"Flow Buyer","email":"flowbuyer@test.com","password":"pass123","company_name":"FlowCo","address":"Pune"}')
echo "$ENT_JSON"
ENT_TOKEN=$(echo "$ENT_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "=== register fresh vendor ==="
VEN_JSON=$(curl -s -X POST $BASE/auth/register/vendor -H "Content-Type: application/json" \
  -d '{"name":"Flow Vendor","email":"flowvendor@test.com","password":"pass123","company_name":"FlowVendorCo","address":"Indore"}')
echo "$VEN_JSON"
VEN_TOKEN=$(echo "$VEN_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "=== register warehouse_staff directly in DB (no self-serve route by design) ==="
WH_HASH=$(./venv/bin/python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('whpass123'))")
mysql -u scm_app -pscm_pass supply_chain_db -e "
INSERT IGNORE INTO \`user\` (name, email, password_hash, role) VALUES ('Flow Warehouse', 'flowwh@test.com', '$WH_HASH', 'warehouse_staff');
" 2>&1 || true

echo "=== vendor lists their product (Kumar Electronics already supplies product 1 in sample data; give the new vendor an offer on product 1 too) ==="
mysql -u scm_app -pscm_pass supply_chain_db -e "
INSERT IGNORE INTO vendor_product (vendor_id, product_id, price, lead_time_days)
SELECT id, 1, 99.00, 2 FROM vendor WHERE user_id = (SELECT id FROM \`user\` WHERE email='flowvendor@test.com');
" 2>&1

echo "=== browse products (as enterprise) ==="
curl -s $BASE/products -H "Authorization: Bearer $ENT_TOKEN"; echo

echo "=== compare vendors for product 1 (multi-vendor price comparison feature) ==="
curl -s $BASE/products/1/vendors -H "Authorization: Bearer $ENT_TOKEN"; echo

echo "=== place order with the new (cheaper) vendor ==="
FLOW_VENDOR_ID=$(mysql -u scm_app -pscm_pass supply_chain_db -N -e "SELECT id FROM vendor WHERE user_id=(SELECT id FROM \`user\` WHERE email='flowvendor@test.com');")
echo "flow vendor id: $FLOW_VENDOR_ID"
ORDER_JSON=$(curl -s -X POST $BASE/orders -H "Authorization: Bearer $ENT_TOKEN" -H "Content-Type: application/json" \
  -d "{\"vendor_id\": $FLOW_VENDOR_ID, \"product_id\": 1, \"quantity\": 20}")
echo "$ORDER_JSON"
ORDER_ID=$(echo "$ORDER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['order_id'])")

echo "=== vendor confirms the order ==="
curl -s -X POST $BASE/orders/$ORDER_ID/confirm -H "Authorization: Bearer $VEN_TOKEN"; echo

echo "=== enterprise attempts to confirm (should be 403, wrong role) ==="
curl -s -w " [HTTP %{http_code}]" -X POST $BASE/orders/$ORDER_ID/confirm -H "Authorization: Bearer $ENT_TOKEN"; echo

echo "=== warehouse staff logs in and reserves stock ==="
WH_JSON=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"email":"flowwh@test.com","password":"whpass123"}')
echo "$WH_JSON"
WH_TOKEN=$(echo "$WH_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -X POST $BASE/orders/$ORDER_ID/reserve-stock -H "Authorization: Bearer $WH_TOKEN" -H "Content-Type: application/json" -d '{"warehouse_id": 1}'; echo

echo "=== confirm inventory actually decremented (product 1 in warehouse 1) ==="
mysql -u scm_app -pscm_pass supply_chain_db -e "SELECT quantity FROM inventory WHERE warehouse_id=1 AND product_id=1;"

echo "=== low stock dashboard as warehouse staff ==="
curl -s $BASE/dashboard/low-stock -H "Authorization: Bearer $WH_TOKEN"; echo

echo "=== run auto-reorder ==="
curl -s -X POST $BASE/dashboard/run-auto-reorder -H "Authorization: Bearer $WH_TOKEN"; echo

echo "=== vendor sales summary as vendor ==="
curl -s $BASE/dashboard/vendor-sales -H "Authorization: Bearer $VEN_TOKEN"; echo

echo "=== list orders as enterprise (should see only their own) ==="
curl -s $BASE/orders -H "Authorization: Bearer $ENT_TOKEN"; echo

echo "=== list orders as vendor (should see only their own) ==="
curl -s $BASE/orders -H "Authorization: Bearer $VEN_TOKEN"; echo
