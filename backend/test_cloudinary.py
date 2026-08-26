import asyncio
from app.db.mongodb import get_db
import cloudinary
import cloudinary.uploader
from app.config import settings

cloudinary.config(cloudinary_url=settings.cloudinary_url)

data = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << >> /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n204\n%%EOF\n"

safe_name = "test_upload.pdf"
res_type = "raw"

upload_result = cloudinary.uploader.upload(
    data, 
    folder="whatsagent/ujjawal/media", 
    public_id=safe_name,
    resource_type=res_type
)

print(upload_result.get("secure_url"))
