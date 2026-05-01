"""
Signal handlers for the ratings app.

Why signals instead of overriding Rating.save()?
Signals let us keep reputation logic here, in the ratings app, rather than
inside the model itself. The model stays a plain data container; side-effects
live in a dedicated layer. This also means the signal fires whether the Rating
is created via the API, the admin, or a management command — no code path can
accidentally bypass it.

Why post_save and not pre_save?
We need the Rating row to exist in the DB before we aggregate over it, so we
must run after the save completes.

Why update_fields=['reputation_avg', 'total_swaps_completed']?
Calling user.save() without update_fields would write every field on the User
row, potentially clobbering concurrent updates (e.g. the user changing their
bio at the same moment). update_fields issues a targeted UPDATE for only those
two columns — safer and faster.
"""

from django.db.models import Avg, Q
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="ratings.Rating")
def update_user_reputation(sender, instance, created, **kwargs):
    """
    Recompute reputation_avg and total_swaps_completed for the rated user
    whenever a new Rating is saved.

    We only run on `created=True` (not on updates). Ratings are immutable once
    submitted — there is no edit endpoint — so an update signal would only fire
    from the admin, which is fine to not recalculate (admin edits are rare ops
    that can be reconciled manually if needed).
    """
    if not created:
        return

    # Import here to avoid circular imports at module load time.
    # ratings → users is fine at runtime; importing at the top of signals.py
    # would create a circular chain: ratings.apps imports signals, signals
    # imports users.models before users is fully loaded.
    from ratings.models import Rating
    from swaps.models import Offer

    rated_user = instance.rated_user

    # Average all star ratings this user has received
    avg = Rating.objects.filter(rated_user=rated_user).aggregate(
        avg=Avg("rating_stars")
    )["avg"]
    rated_user.reputation_avg = round(avg or 0, 2)

    # Count all completed offers this user participated in (as either side)
    rated_user.total_swaps_completed = Offer.objects.filter(
        Q(initiator_user=rated_user) | Q(target_user=rated_user),
        status="completed",
    ).count()

    rated_user.save(update_fields=["reputation_avg", "total_swaps_completed"])
