from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, dashboard, orders, products

app = FastAPI(title="Multi-Vendor Supply Chain Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(orders.router)
app.include_router(dashboard.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "supply-chain-api"}
