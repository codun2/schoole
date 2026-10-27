<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Behavioural / observation notes a teacher records about a student. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_notes', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('student_id')->index();
            $t->unsignedBigInteger('teacher_id')->nullable()->index(); // employees.id (author)
            $t->string('type', 12)->default('note'); // positive | negative | note
            $t->text('note');
            $t->date('date')->index();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_notes');
    }
};
