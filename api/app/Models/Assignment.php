<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A teacher's homework / quiz / exam for one section. */
class Assignment extends TenantModel
{
    public const TYPES = ['homework', 'quiz', 'exam'];

    public const STATUSES = ['open', 'closed', 'archived'];

    protected $casts = ['due_date' => 'date:Y-m-d', 'max_mark' => 'decimal:2'];

    public function section(): BelongsTo { return $this->belongsTo(Section::class); }
    public function subject(): BelongsTo { return $this->belongsTo(Subject::class); }
    public function teacher(): BelongsTo { return $this->belongsTo(Employee::class, 'teacher_id'); }
    public function submissions(): HasMany { return $this->hasMany(AssignmentSubmission::class); }
}
