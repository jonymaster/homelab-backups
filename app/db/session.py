from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from databases import Database

# Define your SQLite database URL, including the database file name
DATABASE_URL = "sqlite:///./app.db"

# Create a new SQLAlchemy engine instance
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

# Create a session local class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Define a base class for all models
Base = declarative_base()

# Define the asynchronous database connection
database = Database(DATABASE_URL)  # This should be present for asynchronous database handling