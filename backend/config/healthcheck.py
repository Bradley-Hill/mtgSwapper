"""
System-level views for the Django project.
"""
from django.http import JsonResponse


def health_check(request):
    """
    Health check endpoint for monitoring and keep-alive purposes.
    
    This lightweight endpoint is called periodically by external cron services
    (e.g., EasyCron, UptimeRobot) to prevent the backend from spinning down
    on free hosting tiers like Render.
    
    Returns:
        JsonResponse: {'status': 'ok'} with HTTP 200
    """
    return JsonResponse({'status': 'ok'}, status=200)
