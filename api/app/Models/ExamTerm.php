<?php

namespace App\Models;

class ExamTerm extends TenantModel
{
    protected $casts = ['weight' => 'decimal:2', 'is_locked' => 'boolean'];
}
