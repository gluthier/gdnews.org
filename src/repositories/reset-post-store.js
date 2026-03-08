const PostRepository = require('./post-repository');

PostRepository.reset().catch((error) => {
    console.error('Post store reset failed:', error.message);
    process.exitCode = 1;
});
