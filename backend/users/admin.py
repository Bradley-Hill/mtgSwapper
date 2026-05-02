from django.contrib import admin
from .models import User, InviteCode


@admin.register(InviteCode)
class InviteCodeAdmin(admin.ModelAdmin):
    list_display = ('code', 'invitee_email', 'inviter_user', 'status', 'created_at', 'expires_at')
    list_filter = ('status',)
    search_fields = ('code', 'invitee_email')
    readonly_fields = ('id', 'created_at', 'accepted_at', 'accepted_user')


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'is_staff', 'date_joined')
    search_fields = ('username', 'email')
