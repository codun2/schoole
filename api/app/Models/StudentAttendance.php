<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StudentAttendance extends TenantModel
{
    protected $casts = ['date' => 'date:Y-m-d'];
    public function student(): BelongsTo { return $this->belongsTo(Student::class); }
}
