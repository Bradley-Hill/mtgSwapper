"""
Views for the Ratings system.
"""

from django.db import IntegrityError
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from swaps.models import Offer
from .models import Rating
from .serializers import RatingSerializer, SubmitRatingSerializer


class RatingViewSet(viewsets.GenericViewSet):
    """
    POST /api/ratings/ — submit a rating for a completed swap.

    Why GenericViewSet?
    We only expose a single action (create). ModelViewSet would auto-generate
    list/retrieve/update/destroy routes we don't want — a rating is immutable
    once submitted and listed via the user profile endpoint, not here.

    Business rules enforced here (not in the model):
    1. Offer must be completed — prevents rating before the swap happened.
    2. Requester must be a participant — non-participants get 403.
    3. Can't rate yourself — edge case guard (shouldn't happen in normal flow).
    4. One rating per participant per offer — enforced by unique_together + we
       return a clear 409 instead of letting the DB exception bubble.

    Why derive rated_user in the view instead of accepting it from the client?
    Accepting rated_user as input would let a malicious client submit a rating
    that names any user as the target. We derive it server-side: "the other
    participant in this offer." This is a security boundary.
    """

    permission_classes = [IsAuthenticated]

    def create(self, request):
        """POST /api/ratings/"""
        serializer = SubmitRatingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        offer_id = serializer.validated_data["offer_id"]
        stars = serializer.validated_data["rating_stars"]
        comment = serializer.validated_data.get("comment", "")

        try:
            offer = Offer.objects.select_related(
                "initiator_user", "target_user"
            ).get(pk=offer_id)
        except Offer.DoesNotExist:
            return Response(
                {"error": "Offer not found."}, status=status.HTTP_404_NOT_FOUND
            )

        rater = request.user

        if rater not in (offer.initiator_user, offer.target_user):
            return Response(
                {"error": "You are not a participant in this offer."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if offer.status != "completed":
            return Response(
                {"error": "You can only rate completed swaps."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rated_user = (
            offer.target_user
            if rater == offer.initiator_user
            else offer.initiator_user
        )

        # Guard: can't rate yourself (would happen if initiator == target, which
        # shouldn't be possible, but be defensive)
        if rater == rated_user:
            return Response(
                {"error": "You cannot rate yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create — unique_together catches duplicate submissions
        try:
            rating = Rating.objects.create(
                rater_user=rater,
                rated_user=rated_user,
                offer=offer,
                rating_stars=stars,
                comment=comment or None,
            )
        except IntegrityError:
            return Response(
                {"error": "You have already rated this swap."},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(RatingSerializer(rating).data, status=status.HTTP_201_CREATED)
