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
from django.utils import timezone
from datetime import datetime
from authentication.models import User

class LawyerProfile(Document):
    """Extended profile information for lawyers"""

    user = ReferenceField(User, required=True, unique=True, reverse_delete_rule=CASCADE)
    phone = StringField(max_length=20, default='')
    education = StringField(max_length=255, default='')
    experience_years = IntField(default=0)
    law_firm = StringField(max_length=255, default='')
    specializations = ListField(StringField(max_length=120), default=list)
    license_number = StringField(max_length=120, required=True)
    bar_council_id = StringField(max_length=120, required=True)
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
        choices=('pending', 'accepted', 'declined', 'withdrawn'),
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