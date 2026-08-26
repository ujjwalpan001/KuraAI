import asyncio
import os
import sys
import time
from datetime import datetime

# Adjust sys.path so we can import from app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.db.mongodb import connect_mongodb, close_mongodb, get_db
from app.api.auth import _hash_password

async def main():
    print("--- Create Admin User ---")
    name = input("Name (e.g. Admin): ").strip() or "Admin"
    email = input("Email/Username: ").strip()
    if not email:
        print("Email/Username is required.")
        return
        
    password = input("Password (min 6 chars): ").strip()
    if len(password) < 6:
        print("Password must be at least 6 characters.")
        return

    print(f"\nConnecting to MongoDB...")
    await connect_mongodb()
    
    try:
        db = get_db()
        
        # Check if user exists
        existing = await db.users.find_one({"email": email})
        if existing:
            print(f"Error: User with email '{email}' already exists.")
            return

        user_id = f"user_{int(time.time())}_{email.split('@')[0]}"
        
        user_doc = {
            "user_id": user_id,
            "name": name,
            "email": email,
            "password_hash": _hash_password(password),
            "created_at": datetime.utcnow(),
        }
        
        await db.users.insert_one(user_doc)
        print(f"Success! Created user '{email}' with name '{name}'.")
        
    finally:
        await close_mongodb()
        print("Disconnected.")

if __name__ == "__main__":
    asyncio.run(main())
