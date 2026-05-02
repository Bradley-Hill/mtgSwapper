"""
Migration: Move Message model from ratings app to swaps app.

WHY SeparateDatabaseAndState?
─────────────────────────────
Django's migration framework tracks which app "owns" each model.  A
plain CreateModel would attempt CREATE TABLE, but the table already
exists (as ratings_message).  SeparateDatabaseAndState lets you split
the instruction into two independent lists:

  database_operations  — commands that run against the real DB
  state_operations     — commands that update Django's migration state

By setting database_operations=[] we tell Django:
  "Don't touch the DB — the table is already there."

By providing a CreateModel in state_operations we tell Django:
  "Believe that swaps.Message exists, pointing at ratings_message."

The companion migration ratings/0004_remove_message_model.py does the
mirror image: DeleteModel in state_operations, [] in database_operations,
so Django stops expecting ratings.Message without dropping the table.

RESULT
──────
After both migrations run:
  • Django state: swaps.Message owns the model, ratings.Message gone.
  • Database:     ratings_message table is unchanged (no downtime, no
                  data movement).

If you later want a tidy schema, rename the table:
  ALTER TABLE ratings_message RENAME TO swaps_message;
  Then remove db_table from Message.Meta and generate a normal migration.
"""
import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("swaps", "0004_add_swap_completion_fields"),
        # We need the ratings migrations to have run first so that the
        # ratings_message table actually exists in the DB.
        ("ratings", "0003_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            # Nothing runs against the real database — the table already exists.
            database_operations=[],
            # Update Django's migration state to believe Message lives in swaps.
            state_operations=[
                migrations.CreateModel(
                    name="Message",
                    fields=[
                        (
                            "id",
                            models.UUIDField(
                                default=uuid.uuid4,
                                editable=False,
                                primary_key=True,
                                serialize=False,
                            ),
                        ),
                        (
                            "offer",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.CASCADE,
                                related_name="messages",
                                to="swaps.offer",
                            ),
                        ),
                        (
                            "sender_user",
                            models.ForeignKey(
                                null=True,
                                on_delete=django.db.models.deletion.SET_NULL,
                                to=settings.AUTH_USER_MODEL,
                            ),
                        ),
                        ("content", models.TextField()),
                        ("is_system_message", models.BooleanField(default=False)),
                        (
                            "created_at",
                            models.DateTimeField(auto_now_add=True, db_index=True),
                        ),
                    ],
                    options={
                        "ordering": ["created_at"],
                        # Must match the existing physical table name.
                        "db_table": "ratings_message",
                        "indexes": [
                            models.Index(
                                fields=["offer_id"],
                                name="ratings_mes_offer_i_9a5ff4_idx",
                            ),
                            models.Index(
                                fields=["created_at"],
                                name="ratings_mes_created_e9db42_idx",
                            ),
                            models.Index(
                                fields=["offer_id", "-created_at"],
                                name="ratings_mes_offer_i_2cf5cb_idx",
                            ),
                        ],
                    },
                ),
            ],
        ),
    ]
