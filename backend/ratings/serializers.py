from rest_framework import serializers

from .models import Rating


class RatingSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for displaying ratings on a user's public profile.

    Why expose rater_username instead of rater_user FK?
    The profile page shows "alice rated you 5★ — great trader!". We need the
    username string for display; the rater's UUID is irrelevant to the reader
    and leaks no extra data.
    """

    rater_username = serializers.CharField(source="rater_user.username", read_only=True)

    class Meta:
        model = Rating
        fields = ["id", "rater_username", "rating_stars", "comment", "created_at"]
        read_only_fields = fields


class SubmitRatingSerializer(serializers.Serializer):
    """
    Write-only serializer for POST /api/ratings/.

    Why a plain Serializer instead of ModelSerializer?
    The client only sends three fields (offer_id, stars, comment). The view
    derives rater_user from request.user and rated_user from the offer — those
    are business logic, not input fields. Using a plain Serializer makes the
    allowed input surface explicit and prevents field-injection attacks.
    """

    offer_id = serializers.UUIDField()
    rating_stars = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=1000,
    )
