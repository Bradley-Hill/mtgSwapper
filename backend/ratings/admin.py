from django.contrib import admin

from .models import Message, Rating

admin.site.register(Message)
admin.site.register(Rating)
