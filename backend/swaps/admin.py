from django.contrib import admin
from .models import Message, Offer, OfferItem, SwapDetails

admin.site.register(Message)
admin.site.register(Offer)
admin.site.register(OfferItem)
admin.site.register(SwapDetails)
