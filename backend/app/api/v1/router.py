# API v1 Router - All endpoint registrations
# Transport ERP

from fastapi import APIRouter

from app.api.v1.endpoints import (
    aliases,
    compat,
    admin,
    invoice_batches,
    batch_progress,
    admin_dashboard,
    auth,
    users,
    clients,
    vehicles,
    drivers,
    jobs,
    lr,
    eway_bill,
    trips,
    finance,
    finance_automation,
    finance_manager,
    banking,
    tracking,
    reports,
    dashboard,
    documents,
    fleet_manager,
    accountant,
    tyre,
    service,
    vahan,
    sarathi,
    echallan,
    gst,
    notifications,
    fuel,
    fuel_pump,
    maps,
    suppliers,
    market_trips,
    geofences,
    compliance,
    driver_scoring,
    customer_portal,
    supplier_portal,
    branches,
    tpms,
    intelligence,
    sync,
    payables,
    receivable_payments,
    user_notifications,
    reconciliation,
    pa_dashboard,
    manager_dashboard,
    document_ocr,
    driver_requests,
    expenses,
    auditor,
    invoice_payments,
)

api_router = APIRouter()

# Compatibility routes (must be first to avoid dynamic /{id} route collisions)
api_router.include_router(compat.router, tags=["Compatibility"])
api_router.include_router(aliases.router, tags=["Aliases"])

# Authentication
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])

# User Management
api_router.include_router(users.router, prefix="/users", tags=["Users"])

# Admin
api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])

# Admin Dashboard
api_router.include_router(admin_dashboard.router, prefix="/admin", tags=["Admin Dashboard"])

# Core Business Modules
api_router.include_router(clients.router, prefix="/clients", tags=["Clients"])
api_router.include_router(vehicles.router, prefix="/vehicles", tags=["Vehicles"])
api_router.include_router(drivers.router, prefix="/drivers", tags=["Drivers"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
api_router.include_router(lr.router, prefix="/lr", tags=["Lorry Receipts"])
api_router.include_router(eway_bill.router, prefix="/eway-bills", tags=["E-way Bills"])
api_router.include_router(trips.router, prefix="/trips", tags=["Trips"])

# Suppliers & Market Trucks
api_router.include_router(suppliers.router, prefix="/suppliers", tags=["Suppliers"])
api_router.include_router(market_trips.router, prefix="/market-trips", tags=["Market Trips"])

# Geofencing & Compliance
api_router.include_router(geofences.router, prefix="/geofences", tags=["Geofences"])
api_router.include_router(compliance.router, prefix="/compliance", tags=["Compliance"])

# Driver Scoring
api_router.include_router(driver_scoring.router, prefix="/driver-scoring", tags=["Driver Scoring"])

# Finance
api_router.include_router(finance.router, prefix="/finance", tags=["Finance"])
api_router.include_router(finance_automation.router, prefix="/finance", tags=["Finance Automation"])
api_router.include_router(invoice_payments.router, prefix="/finance", tags=["Invoice Payment Proof"])

# Finance Manager — salary, advances, expenses, payables, Razorpay payouts
api_router.include_router(finance_manager.router, prefix="/finance-manager", tags=["Finance Manager"])

# Payables (Driver Settlements)
api_router.include_router(payables.router, prefix="/payables", tags=["Payables"])

# Banking
api_router.include_router(banking.router, prefix="/banking", tags=["Banking"])

# Reconciliation
api_router.include_router(reconciliation.router, prefix="/reconciliation", tags=["Reconciliation"])

# Tracking & Monitoring
api_router.include_router(tracking.router, prefix="/tracking", tags=["Tracking"])

# Document Management
api_router.include_router(documents.router, prefix="/documents", tags=["Documents"])

# Document OCR (free Tesseract-based scanner)
api_router.include_router(document_ocr.router, prefix="/documents", tags=["Document OCR"])

# Reports & Dashboard
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])

# Fleet Manager
api_router.include_router(fleet_manager.router, prefix="/fleet", tags=["Fleet Manager"])
api_router.include_router(tyre.router, prefix="/tyre", tags=["Tyre"])
api_router.include_router(service.router, prefix="/service", tags=["Service"])

# Accountant
api_router.include_router(accountant.router, prefix="/accountant", tags=["Accountant"])

# Government API Integrations
api_router.include_router(vahan.router, prefix="/vahan", tags=["VAHAN"])
api_router.include_router(sarathi.router, prefix="/sarathi", tags=["Sarathi"])
api_router.include_router(echallan.router, prefix="/echallan", tags=["eChallan"])
api_router.include_router(gst.router, prefix="/gst", tags=["GST"])

# Maps & Routing
api_router.include_router(maps.router, prefix="/maps", tags=["Maps"])

# Notifications
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications (Push/SMS)"])

# In-app user notifications feed
api_router.include_router(user_notifications.router, prefix="/my-notifications", tags=["In-App Notifications"])

# PA Dashboard
api_router.include_router(pa_dashboard.router, prefix="/pa/dashboard", tags=["PA Dashboard"])

# Manager Dashboard
api_router.include_router(manager_dashboard.router, prefix="/manager/dashboard", tags=["Manager Dashboard"])

# Fuel Prices
api_router.include_router(fuel.router, prefix="/fuel-prices", tags=["Fuel Prices"])

# Fuel Pump Management
api_router.include_router(fuel_pump.router, prefix="/fuel-pump", tags=["Fuel Pump"])

# Customer & Supplier Portals
api_router.include_router(customer_portal.router, prefix="/portal/customer", tags=["Customer Portal"])
api_router.include_router(supplier_portal.router, prefix="/portal/supplier", tags=["Supplier Portal"])

# Branch Management
api_router.include_router(branches.router, prefix="/branches", tags=["Branches"])

# Driver Leave & Advance Requests
api_router.include_router(driver_requests.router, prefix="/driver-requests", tags=["Driver Requests"])

# TPMS + Predictive Maintenance
api_router.include_router(tpms.router, prefix="/tpms", tags=["TPMS"])

# Intelligence Layer
api_router.include_router(intelligence.router, prefix="/intelligence", tags=["Intelligence"])

# Offline Sync
api_router.include_router(sync.router, prefix="/sync", tags=["Sync"])

# Receivable Payments (UPI / NEFT / RTGS / Cheque / Cash)
# Registered without prefix — router defines full paths:
#   GET  /clients/{id}/payment-info
#   POST /receivables/record-payment
#   GET  /receivables/{id}/payments
api_router.include_router(receivable_payments.router, tags=["Receivable Payments"])

# Company Expenses (field GPay, driver advance, salaries, rent, etc.)
api_router.include_router(expenses.router, prefix="/expenses", tags=["Company Expenses"])
api_router.include_router(auditor.router, prefix="/auditor", tags=["Auditor"])

# IFIAS — Intelligent Freight Invoice Automation
api_router.include_router(invoice_batches.router, prefix="", tags=["IFIAS Invoice Automation"])
api_router.include_router(batch_progress.router, tags=["IFIAS WebSocket Progress"])
