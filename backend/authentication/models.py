from mongoengine import (
    Document,
    StringField,
    BooleanField,
    DateTimeField,
    EmailField,
    ReferenceField,
    ListField,
    IntField,
    CASCADE,
)
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from datetime import datetime

class User(Document):
    """MongoDB User Model using MongoEngine"""
    
    email = EmailField(required=True, unique=True, max_length=255)
    username = StringField(required=True, unique=True, max_length=150)
    name = StringField(max_length=255, default='')
    profile_picture = StringField(max_length=255, default='')
    cover_photo = StringField(max_length=255, default='') 
    password = StringField(required=True)
    phone = StringField(max_length=20, default='')
    
    is_active = BooleanField(default=True)
    is_staff = BooleanField(default=False)
    is_superuser = BooleanField(default=False)
    is_verified = BooleanField(default=False)  
    role = StringField(max_length=32, default='client', choices=('client', 'lawyer', 'admin'))
    is_lawyer_verified = BooleanField(default=False)
    lawyer_verification_status = StringField(max_length=32, default='not_submitted')  
    lawyer_verified_at = DateTimeField()
    
    google_id = StringField(max_length=255, unique=True, sparse=True)
    auth_provider = StringField(max_length=50, default='email')  # 'email' or 'google'
    
    otp_code = StringField(max_length=6)
    otp_created_at = DateTimeField()
    
    date_joined = DateTimeField(default=datetime.now)
    last_login = DateTimeField()
    
    meta = {
        'collection': 'users',
        'db_alias': 'default',
        'indexes': [
            'email',
            'username',
            {'fields': ['google_id'], 'sparse': True}
        ]
    }
    
    def __str__(self):
        return self.email
    
    def set_password(self, raw_password):
        """Hash and set the password"""
        self.password = make_password(raw_password)
    
    def check_password(self, raw_password):
        """Check if the provided password is correct"""
        return check_password(raw_password, self.password)

    def has_usable_password(self):
        """Check if the user has a usable password"""
        return self.password is not None and self.password != '!'
    
    def get_full_name(self):
        return self.name or self.username
    
    def get_short_name(self):
        return self.username
    
    @property
    def is_authenticated(self):
        """Always return True for authenticated users"""
        return True
    
    @property
    def is_anonymous(self):
        """Always return False for authenticated users"""
        return False

    @property
    def is_lawyer(self):
        return self.role == 'lawyer'
    
    def save(self, *args, **kwargs):
        """Override save to handle password hashing"""
        if self.password and '$' not in self.password:
            self.set_password(self.password)
        super(User, self).save(*args, **kwargs)
    
    @classmethod
    def create_user(cls, email, username, password=None, **extra_fields):
        """Create and return a regular user"""
        if not email:
            raise ValueError('The Email field must be set')
        if not username:
            raise ValueError('The Username field must be set')
        
        user = cls(
            email=email.lower(),
            username=username,
            **extra_fields
        )
        if password:
            user.set_password(password)
        else:
            user.password = None  
        user.save()
        return user
    
    @classmethod
    def create_superuser(cls, email, username, password=None, **extra_fields):
        """Create and return a superuser"""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        
        return cls.create_user(email, username, password, **extra_fields)


class LawyerProfile(Document):
    """Extended profile information for lawyers"""

    user = ReferenceField(User, required=True, unique=True, reverse_delete_rule=CASCADE)
    phone = StringField(max_length=20, default='')
    education = StringField(max_length=255, default='')
    experience_years = IntField(default=0)
    law_firm = StringField(max_length=255, default='')
    specializations = ListField(StringField(max_length=120), default=list)
    license_number = StringField(max_length=120, required=True)
    bar_council_id = StringField(max_length=120, required=False, default='')
    consultation_fee = StringField(max_length=120, default='')
    bio = StringField(default='')
    verification_documents = ListField(StringField(max_length=512), default=list)
    verification_status = StringField(
        max_length=32,
        default='pending',
        choices=('pending', 'approved', 'rejected'),
    )
    verification_notes = StringField(default='')
    verified_at = DateTimeField()
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        'collection': 'lawyer_profiles',
        'db_alias': 'default',
        'indexes': [
            'verification_status',
            {'fields': ['user'], 'unique': True},
        ],
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)


class LawyerConnectionRequest(Document):
    """Connection requests between clients and lawyers"""

    client = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    lawyer = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    message = StringField(default='')
    status = StringField(
        max_length=32,
        default='pending',
        choices=('pending', 'accepted', 'declined'),
    )
    preferred_time = DateTimeField(required=False, null=True)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        'collection': 'lawyer_connection_requests',
        'db_alias': 'default',
        'strict': False,
        'indexes': [
            {'fields': ['client', 'lawyer', 'status']},
            'lawyer',
            'client',
        ],
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)
