# push.ps1

$repo = "https://github.com/satwikmishra1107/ChunkyDiscord"
$branch = "main"

if (!(Test-Path ".git")) {
    Write-Host "Initializing Git repository..."
    git init
    git branch -M $branch
    git remote add origin $repo
}

git add .

$message = Read-Host "Enter commit message"

if ([string]::IsNullOrWhiteSpace($message)) {
    $message = "Update portfolio"
}

git commit -m "$message"

git push -u origin $branch