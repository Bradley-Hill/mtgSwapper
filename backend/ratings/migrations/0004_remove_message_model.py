"""
Migration: Remove Message from the ratings app migration state.

Companion to swaps/0005_move_message_from_ratings.py.

database_operations=[]   — don't drop the table (swaps now owns it)
state_operations=[DeleteModel] — tell Django ratings no longer has Message
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        # Must come after the swaps migration that claims ownership.
        ("swaps", "0005_move_message_from_ratings"),
        ("ratings", "0003_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.DeleteModel("Message"),
            ],
        ),
    ]
