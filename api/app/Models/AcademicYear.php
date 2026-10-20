<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AcademicYear extends TenantModel
{
    protected $casts = ['start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d', 'is_current' => 'boolean'];
}
