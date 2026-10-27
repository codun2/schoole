<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentNote extends TenantModel
{
    public const TYPES = ['positive', 'negative', 'note'];

    protected $casts = ['date' => 'date:Y-m-d'];

    public function student(): BelongsTo { return $this->belongsTo(Student::class); }
    public function teacher(): BelongsTo { return $this->belongsTo(Employee::class, 'teacher_id'); }
}
