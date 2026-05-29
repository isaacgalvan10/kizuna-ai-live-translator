from pydantic import BaseModel
from typing import Optional

# Base properties shared across creation and reading
class ChurchBase(BaseModel):
    name: str

# What the frontend sends when creating a church
class ChurchCreate(ChurchBase):
    pass

# What the API returns to the frontend
class ChurchResponse(ChurchBase):
    id: int
    qr_code_hash: str

    class Config:
        # Tells Pydantic to read data even if it's not a dict (like a SQLAlchemy model)
        from_attributes = True