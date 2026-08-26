import smtplib
from email.message import EmailMessage
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import logging

router = APIRouter(prefix="/api/contact", tags=["contact"])
logger = logging.getLogger(__name__)

class ContactForm(BaseModel):
    name: str
    email: str
    message: str

@router.post("")
async def submit_contact_form(form: ContactForm):
    # To actually send emails, the user must set SMTP_EMAIL and SMTP_PASSWORD in .env
    smtp_email = os.getenv("SMTP_EMAIL")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 465))
    target_emails = ["Kuraai.admin@gmail.com"]

    from app.db.mongodb import get_db
    from datetime import datetime
    
    db = get_db()
    await db.contact_messages.insert_one({
        "name": form.name,
        "email": form.email,
        "message": form.message,
        "created_at": datetime.utcnow()
    })

    if not smtp_email or not smtp_password:
        logger.warning(f"Contact form submitted by {form.email}, saved to DB, but SMTP credentials are not configured.")
        return {"status": "success", "message": "Email logged and saved to DB (SMTP not configured)."}

    msg = EmailMessage()
    msg['Subject'] = f"New Contact from {form.name} ({form.email})"
    msg['From'] = smtp_email
    msg['To'] = ", ".join(target_emails)
    msg.set_content(f"Name: {form.name}\nEmail: {form.email}\n\nMessage:\n{form.message}")

    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
                server.login(smtp_email, smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(smtp_email, smtp_password)
                server.send_message(msg)
        
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email. Check SMTP configuration.")
