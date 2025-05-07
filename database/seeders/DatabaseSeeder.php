<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        User::factory()->create([
            'name' => 'Flutter Employee',
            'email' => 'flutter-employee@example.com',
        ]);

        $this->call([
            ProductSeeder::class,
            OrderSeeder::class,
        ]);
    }
}
