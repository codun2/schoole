<?php

namespace App\Models;

class EvaluationPeriod extends TenantModel
{
    protected $casts = ['from_date' => 'date:Y-m-d', 'to_date' => 'date:Y-m-d'];
}
