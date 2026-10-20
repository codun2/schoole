<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** HR extras: employee contracts, and the performance-evaluation suite. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_contracts', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('employee_id')->index();
            $t->string('number')->index();
            $t->string('type', 20)->default('permanent'); // permanent | fixed | part_time
            $t->date('start_date');
            $t->date('end_date')->nullable()->index();
            $t->decimal('basic_salary', 12, 3)->default(0);
            $t->decimal('allowances', 12, 3)->default(0);
            $t->string('status', 20)->default('active'); // active | expired | terminated
            $t->string('attachment')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('evaluation_criteria', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name');
            $t->decimal('weight', 5, 2)->default(0); // % of the total
            $t->decimal('max_score', 6, 2)->default(100);
            $t->unsignedInteger('sort')->default(0);
            $t->timestamps();
        });

        Schema::create('evaluation_periods', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name');
            $t->date('from_date')->nullable();
            $t->date('to_date')->nullable();
            $t->string('status', 12)->default('open'); // open | closed
            $t->timestamps();
        });

        Schema::create('evaluations', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('employee_id')->index();
            $t->unsignedBigInteger('period_id')->index();
            $t->decimal('total_score', 6, 2)->default(0); // weighted percentage
            $t->string('grade', 20)->nullable();
            $t->unsignedBigInteger('evaluator_id')->nullable();
            $t->date('date')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['employee_id', 'period_id'], 'eval_unique');
        });

        Schema::create('evaluation_scores', function (Blueprint $t) {
            $t->id();
            $t->foreignId('evaluation_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('criterion_id');
            $t->decimal('score', 6, 2)->default(0);
            $t->string('note')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['evaluation_scores', 'evaluations', 'evaluation_periods', 'evaluation_criteria', 'employee_contracts'] as $tbl) {
            Schema::dropIfExists($tbl);
        }
    }
};
