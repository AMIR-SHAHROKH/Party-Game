# backend/app/admin.py
from fastapi import FastAPI
from fastapi_admin.app import app as admin_app
from fastapi_admin.resources import Model
from fastapi_admin.widgets import displays
from app.admin_model import Admin  # correct import
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def setup_admin(app: FastAPI):
    admin_app.init(
        app=app,
        title="QA Game Admin",
        logo_url="https://fastapi-admin-docs.long2ice.io/logo.png",
        template_folders=[],
        favicon_url=None,
    )

class AdminResource(Model):
    model = Admin
    label = "Admins"
    icon = "fas fa-user"
    fields = [
        displays.Display(name="id", label="ID"),
        displays.Display(name="username", label="Username"),
        displays.Display(name="email", label="Email"),
        displays.InputOnly(name="password", label="Password"),
    ]

admin_app.register(AdminResource)

__all__ = ["setup_admin", "Admin"]
