<?php

namespace Laravel\Nova\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Laravel\Nova\Http\Requests\NotificationRequest;
use Laravel\Nova\Notifications\Notification;

class NotificationDeleteController extends Controller
{
    /**
     * Mark the given notification as read.
     */
    public function __invoke(NotificationRequest $request): JsonResponse
    {
        $notification = Notification::findOrFail($request->notification);
        $notification->update(['read_at' => now()]);
        $notification->delete();

        return response()->json();
    }
}
