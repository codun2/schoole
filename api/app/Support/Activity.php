<?php

namespace App\Support;

use App\Models\ActivityLog;
use App\Models\AppNotification;
use Illuminate\Database\Eloquent\Model;

/** Audit trail + in-app notifications for the current school. */
class Activity
{
    public static function log(string $action, ?Model $subject, string $description): void
    {
        try {
            ActivityLog::create([
                'user_id'      => auth()->id(),
                'action'       => $action,
                'subject_type' => $subject ? class_basename($subject) : null,
                'subject_id'   => $subject?->getKey(),
                'description'  => mb_substr($description, 0, 250),
            ]);
        } catch (\Throwable) {
            // Auditing must never break the actual operation.
        }
    }

    public static function notify(string $type, string $title, ?string $body = null, ?string $link = null, ?int $userId = null): void
    {
        AppNotification::create(compact('type', 'title', 'body', 'link') + ['user_id' => $userId]);
    }
}
