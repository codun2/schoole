<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Announcement — company_id null means a platform-wide notice from the super-admin. */
class Announcement extends Model
{
    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = ['is_active' => 'boolean'];
}
